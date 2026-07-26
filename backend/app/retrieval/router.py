from fastapi import APIRouter, HTTPException

from app.retrieval.schemas import (
    RetrievalRequest,
    RetrievalResponse,
)
from app.retrieval.service import retrieve_chunks


router = APIRouter(
    prefix="/retrieval",
    tags=["retrieval"],
)


@router.post(
    "/search",
    response_model=RetrievalResponse,
)
def search_chunks(
    request: RetrievalRequest,
) -> RetrievalResponse:
    """
    Retrieve semantically relevant source chunks for a question.
    """

    try:
        matches = retrieve_chunks(
            question=request.question,
            figure_slug=request.figure_slug,
            match_count=request.match_count,
        )

    except ValueError as exc:
        raise HTTPException(
            status_code=404,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Retrieval failed.",
        ) from exc

    return RetrievalResponse(
        question=request.question,
        figure_slug=request.figure_slug,
        match_count=len(matches),
        matches=matches,
    )