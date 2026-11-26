import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Generator, Literal
from uuid import UUID

import anyio
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.database.client import get_supabase_client
from app.generation.schemas import AnswerRequest, AnswerResponse, AnswerSource
from app.generation.service import generate_grounded_answer, stream_grounded_answer
from app.observability import Observation, start_answer_trace, new_response_id, record_feedback
from app.retrieval.service import known_figure_slug

logger = logging.getLogger("uvicorn.error")
router = APIRouter(prefix="/chat", tags=["chat"])


class FeedbackRequest(BaseModel):
    response_id: UUID
    figure_slug: str = Field(min_length=1)
    question: str = Field(min_length=1, max_length=10000)
    answer: str = Field(min_length=1, max_length=30000)
    rating: Literal[-1, 1]


class FeedbackResponse(BaseModel):
    saved: bool
    rating: Literal[-1, 1]


def build_sources(matches: list[dict[str, Any]]) -> list[AnswerSource]:
    sources: list[AnswerSource] = []
    for source_number, match in enumerate(matches, start=1):
        sources.append(AnswerSource(
            source_number=source_number,
            chunk_key=match["chunk_key"],
            chunk_index=match["chunk_index"],
            content=match["content"],
            similarity=match["similarity"],
            metadata=match["metadata"],
        ))
    return sources


@router.post("/answer", response_model=AnswerResponse)
def answer_question(request: AnswerRequest) -> AnswerResponse:
    started = time.perf_counter()
    trace = start_answer_trace(
        request_id=str(request.request_id) if request.request_id else None,
        response_id=new_response_id(),
        figure_slug=known_figure_slug(request.figure_slug),
        request_type="non_streaming",
        question_length_chars=len(request.question),
        question=request.question,
    )
    try:
        result = generate_grounded_answer(
            question=request.question,
            figure_slug=request.figure_slug,
            match_count=request.match_count,
            trace=trace,
        )
        sources = build_sources(result["matches"])
        if trace.capture_content:
            trace.preview_output(content={"answer": result["answer"]})
        total_ms = (time.perf_counter() - started) * 1000
        trace.annotate(source_count=len(sources), answer_length_chars=len(result["answer"]), generation_model=result["model"])
        logger.info("PERF answer slug=%s sources=%s total_ms=%.1f", request.figure_slug, len(sources), total_ms)
        return AnswerResponse(question=request.question, figure_slug=request.figure_slug, answer=result["answer"], model=result["model"], sources=sources)
    except ValueError as exc:
        trace.annotate(outcome="failed", error_type="validation_error")
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        trace.annotate(outcome="failed", error_type="backend_error")
        logger.exception("PERF answer failed slug=%s total_ms=%.1f", request.figure_slug, (time.perf_counter() - started) * 1000)
        raise HTTPException(status_code=500, detail="Answer generation failed.") from exc
    finally:
        trace.annotate(backend_total_latency_ms=(time.perf_counter() - started) * 1000)
        trace.finish()


class ObservedStreamingResponse(StreamingResponse):
    """Close the sync generator on disconnect, even between streamed chunks."""
    def __init__(self, stream: Generator[str, None, None], trace: Observation, started: float, **kwargs: Any):
        super().__init__(stream, **kwargs)
        self._observed_stream = stream
        self._answer_trace = trace
        self._answer_started = started

    def _close_stream(self) -> None:
        try:
            self._observed_stream.close()
        except Exception:
            logger.warning("OBSERVABILITY stream cleanup failed")
        finally:
            # Covers a connection that closes before the generator begins.
            self._answer_trace.annotate(backend_total_latency_ms=(time.perf_counter() - self._answer_started) * 1000)
            self._answer_trace.finish("interrupted")

    async def __call__(self, scope, receive, send) -> None:
        try:
            await super().__call__(scope, receive, send)
        finally:
            with anyio.CancelScope(shield=True):
                await anyio.to_thread.run_sync(self._close_stream)


@router.post("/answer/stream")
def answer_question_stream(request: AnswerRequest) -> StreamingResponse:
    started = time.perf_counter()
    response_id = new_response_id()
    request_id = str(request.request_id) if request.request_id else None
    trace = start_answer_trace(
        request_id=request_id,
        response_id=response_id,
        figure_slug=known_figure_slug(request.figure_slug),
        request_type="streaming",
        question_length_chars=len(request.question),
        question=request.question,
    )

    def event_stream() -> Generator[str, None, None]:
        terminal: str | None = None
        answer_chars = 0
        answer_parts: list[str] = []
        first_text_ms: float | None = None
        pipeline = None
        try:
            logger.info("PERF stream accepted slug=%s request_id=%s response_id=%s", request.figure_slug, request_id, response_id)
            yield json.dumps({"type": "meta", "response_id": response_id, "request_id": request_id}) + "\n"
            pipeline = stream_grounded_answer(question=request.question, figure_slug=request.figure_slug, match_count=request.match_count, trace=trace)
            for event in pipeline:
                event_type = event["type"]
                if event_type == "sources":
                    sources = build_sources(event["sources"])
                    trace.annotate(source_count=len(sources))
                    payload = {"type": "sources", "sources": [source.model_dump() for source in sources]}
                else:
                    payload = event
                if event_type == "delta":
                    text = event["text"]
                    answer_chars += len(text)
                    if trace.capture_content:
                        answer_parts.append(text)
                    if first_text_ms is None and text.strip():
                        first_text_ms = (time.perf_counter() - started) * 1000
                elif event_type == "blocked":
                    terminal = "blocked"
                    trace.annotate(source_count=0, blocked_categories=event.get("categories", []))
                elif event_type == "done":
                    terminal = "blocked" if terminal == "blocked" else "completed"
                    trace.annotate(answer_type=event.get("answer_type"), generation_model=event.get("model"))
                encoded = json.dumps(payload, ensure_ascii=False) + "\n"
                if event_type == "done":
                    if trace.capture_content:
                        trace.preview_output(content={"answer": "".join(answer_parts)})
                    trace.annotate(answer_length_chars=answer_chars, backend_ttft_ms=first_text_ms,
                                   backend_total_latency_ms=(time.perf_counter() - started) * 1000)
                    trace.finish(terminal)
                yield encoded
            if terminal is None:
                trace.annotate(error_type="incomplete_stream")
                terminal = "failed"
        except ValueError as exc:
            terminal = "failed"
            trace.annotate(error_type="validation_error")
            yield json.dumps({"type": "error", "message": str(exc)}, ensure_ascii=False) + "\n"
        except Exception:
            terminal = "failed"
            trace.annotate(error_type="backend_error")
            logger.exception("PERF stream failed slug=%s request_id=%s response_id=%s total_ms=%.1f", request.figure_slug, request_id, response_id, (time.perf_counter() - started) * 1000)
            yield json.dumps({"type": "error", "message": "Answer generation failed."}, ensure_ascii=False) + "\n"
        finally:
            try:
                if pipeline is not None:
                    pipeline.close()
            except Exception:
                logger.warning("OBSERVABILITY pipeline cleanup failed")
            finally:
                trace.annotate(answer_length_chars=answer_chars, backend_ttft_ms=first_text_ms,
                               backend_total_latency_ms=(time.perf_counter() - started) * 1000)
                trace.finish(terminal or "interrupted")

    return ObservedStreamingResponse(event_stream(), trace, started, media_type="application/x-ndjson", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/feedback", response_model=FeedbackResponse)
def save_answer_feedback(request: FeedbackRequest) -> FeedbackResponse:
    started = time.perf_counter()
    try:
        supabase = get_supabase_client()
        payload = {
            "response_id": str(request.response_id),
            "figure_slug": request.figure_slug,
            "question": request.question,
            "answer": request.answer,
            "rating": request.rating,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        supabase.table("answer_feedback").upsert(payload, on_conflict="response_id").execute()
    except Exception as exc:
        logger.exception("PERF feedback failed response_id=%s total_ms=%.1f", request.response_id, (time.perf_counter() - started) * 1000)
        raise HTTPException(status_code=500, detail="Unable to save feedback.") from exc
    record_feedback(str(request.response_id), request.rating)
    total_ms = (time.perf_counter() - started) * 1000
    logger.info("PERF feedback response_id=%s rating=%s total_ms=%.1f", request.response_id, request.rating, total_ms)
    return FeedbackResponse(saved=True, rating=request.rating)
