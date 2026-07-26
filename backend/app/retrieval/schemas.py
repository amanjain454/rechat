from typing import Any

from pydantic import BaseModel, Field


class RetrievalRequest(BaseModel):
    """
    Request body for semantic chunk retrieval.
    """

    question: str = Field(
        min_length=1,
        description="Question to search for.",
    )

    figure_slug: str = Field(
        default="mahatma-gandhi",
        min_length=1,
        description="Stable slug of the selected figure.",
    )

    match_count: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Maximum number of chunks to return.",
    )


class RetrievalMatch(BaseModel):
    """
    One ranked chunk returned by vector search.
    """

    id: int
    chunk_key: str
    document_id: int
    figure_id: int
    chunk_index: int
    content: str
    character_count: int
    token_count: int
    metadata: dict[str, Any]
    similarity: float


class RetrievalResponse(BaseModel):
    """
    Complete retrieval response.
    """

    question: str
    figure_slug: str
    match_count: int
    matches: list[RetrievalMatch]