from typing import Any

from pydantic import BaseModel, Field


class AnswerRequest(BaseModel):
    """
    Request body for grounded answer generation.
    """

    question: str = Field(
        min_length=1,
        description="Question to answer using retrieved sources.",
    )

    figure_slug: str = Field(
        default="mahatma-gandhi",
        min_length=1,
        description="Stable slug of the selected figure.",
    )

    match_count: int = Field(
        default=5,
        ge=1,
        le=10,
        description="Number of source chunks used as context.",
    )


class AnswerSource(BaseModel):
    """
    Retrieved source passage supporting the generated answer.
    """

    source_number: int
    chunk_key: str
    chunk_index: int
    content: str
    similarity: float
    metadata: dict[str, Any]


class AnswerResponse(BaseModel):
    """
    Grounded answer plus the passages used to generate it.
    """

    question: str
    figure_slug: str
    answer: str
    model: str | None
    sources: list[AnswerSource]