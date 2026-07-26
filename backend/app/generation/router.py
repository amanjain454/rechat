from typing import Any

from fastapi import APIRouter, HTTPException

from app.generation.schemas import (
    AnswerRequest,
    AnswerResponse,
    AnswerSource,
)
from app.generation.service import generate_grounded_answer


router = APIRouter(
    prefix="/chat",
    tags=["chat"],
)


@router.post(
    "/answer",
    response_model=AnswerResponse,
)
def answer_question(
    request: AnswerRequest,
) -> AnswerResponse:
    """
    Retrieve relevant source passages and generate a grounded answer.
    """

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
        raise HTTPException(
            status_code=500,
            detail="Answer generation failed.",
        ) from exc

    # Tell the type checker that matches is a list of dictionaries.
    matches: list[dict[str, Any]] = result["matches"]

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

    return AnswerResponse(
        question=request.question,
        figure_slug=request.figure_slug,
        answer=result["answer"],
        model=result["model"],
        sources=sources,
    )