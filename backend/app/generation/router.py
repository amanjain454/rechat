import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Iterator, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.database.client import get_supabase_client
from app.generation.schemas import (
    AnswerRequest,
    AnswerResponse,
    AnswerSource,
)
from app.generation.service import (
    generate_grounded_answer,
    stream_grounded_answer,
)

logger = logging.getLogger("uvicorn.error")

router = APIRouter(
    prefix="/chat",
    tags=["chat"],
)


class FeedbackRequest(BaseModel):
    response_id: UUID
    figure_slug: str = Field(min_length=1)
    question: str = Field(min_length=1, max_length=10000)
    answer: str = Field(min_length=1, max_length=30000)
    rating: Literal[-1, 1]


class FeedbackResponse(BaseModel):
    saved: bool
    rating: Literal[-1, 1]


def build_sources(
    matches: list[dict[str, Any]],
) -> list[AnswerSource]:
    sources: list[AnswerSource] = []

    for source_number, match in enumerate(
        matches,
        start=1,
    ):
        sources.append(
            AnswerSource(
                source_number=source_number,
                chunk_key=match["chunk_key"],
                chunk_index=match["chunk_index"],
                content=match["content"],
                similarity=match["similarity"],
                metadata=match["metadata"],
            )
        )

    return sources


@router.post(
    "/answer",
    response_model=AnswerResponse,
)
def answer_question(
    request: AnswerRequest,
) -> AnswerResponse:
    started = time.perf_counter()

    try:
        result = generate_grounded_answer(
            question=request.question,
            figure_slug=request.figure_slug,
            match_count=request.match_count,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        logger.exception(
            "PERF answer failed slug=%s total_ms=%.1f",
            request.figure_slug,
            (time.perf_counter() - started) * 1000,
        )

        raise HTTPException(
            status_code=500,
            detail="Answer generation failed.",
        ) from exc

    sources = build_sources(result["matches"])

    total_ms = (time.perf_counter() - started) * 1000

    logger.info(
        "PERF answer slug=%s sources=%s total_ms=%.1f",
        request.figure_slug,
        len(sources),
        total_ms,
    )

    return AnswerResponse(
        question=request.question,
        figure_slug=request.figure_slug,
        answer=result["answer"],
        model=result["model"],
        sources=sources,
    )


@router.post("/answer/stream")
def answer_question_stream(
    request: AnswerRequest,
) -> StreamingResponse:
    started = time.perf_counter()
    response_id = str(uuid4())

    def event_stream() -> Iterator[str]:
        # Send a stable response identifier immediately. The frontend uses it
        # to attach thumbs feedback to the exact generated response.
        yield json.dumps(
            {
                "type": "meta",
                "response_id": response_id,
            }
        ) + "\n"

        try:
            for event in stream_grounded_answer(
                question=request.question,
                figure_slug=request.figure_slug,
                match_count=request.match_count,
            ):
                if event["type"] == "sources":
                    sources = build_sources(event["sources"])
                    payload = {
                        "type": "sources",
                        "sources": [
                            source.model_dump()
                            for source in sources
                        ],
                    }
                else:
                    payload = event

                yield json.dumps(
                    payload,
                    ensure_ascii=False,
                ) + "\n"

        except ValueError as exc:
            yield json.dumps(
                {
                    "type": "error",
                    "message": str(exc),
                },
                ensure_ascii=False,
            ) + "\n"

        except Exception:
            logger.exception(
                "PERF stream failed slug=%s response_id=%s total_ms=%.1f",
                request.figure_slug,
                response_id,
                (time.perf_counter() - started) * 1000,
            )

            yield json.dumps(
                {
                    "type": "error",
                    "message": "Answer generation failed.",
                },
                ensure_ascii=False,
            ) + "\n"

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/feedback",
    response_model=FeedbackResponse,
)
def save_answer_feedback(
    request: FeedbackRequest,
) -> FeedbackResponse:
    started = time.perf_counter()

    try:
        supabase = get_supabase_client()

        payload = {
            "response_id": str(request.response_id),
            "figure_slug": request.figure_slug,
            "question": request.question,
            "answer": request.answer,
            "rating": request.rating,
            "updated_at": datetime.now(
                timezone.utc
            ).isoformat(),
        }

        (
            supabase.table("answer_feedback")
            .upsert(
                payload,
                on_conflict="response_id",
            )
            .execute()
        )

    except Exception as exc:
        logger.exception(
            "PERF feedback failed response_id=%s total_ms=%.1f",
            request.response_id,
            (time.perf_counter() - started) * 1000,
        )

        raise HTTPException(
            status_code=500,
            detail="Unable to save feedback.",
        ) from exc

    total_ms = (
        time.perf_counter() - started
    ) * 1000

    logger.info(
        (
            "PERF feedback response_id=%s rating=%s "
            "total_ms=%.1f"
        ),
        request.response_id,
        request.rating,
        total_ms,
    )

    return FeedbackResponse(
        saved=True,
        rating=request.rating,
    )
