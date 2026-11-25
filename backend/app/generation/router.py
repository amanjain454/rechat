import json
import logging
import time
from typing import Any, Iterator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

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


def build_sources(
    matches: list[dict[str, Any]],
) -> list[AnswerSource]:
    """
    Convert retrieval rows to the stable public answer-source schema.
    """
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
    """
    Non-streaming fallback endpoint.
    """
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
    """
    Stream a grounded answer as newline-delimited JSON (NDJSON).

    NDJSON is used instead of EventSource because the request is a POST with a
    JSON body. The browser reads the response body incrementally with fetch().
    """
    started = time.perf_counter()

    def event_stream() -> Iterator[str]:
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
                "PERF stream failed slug=%s total_ms=%.1f",
                request.figure_slug,
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
