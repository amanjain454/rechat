from typing import Any

from app.database.client import get_supabase_client
from app.ingestion.embeddings import generate_embeddings


DEFAULT_MATCH_COUNT = 5


def get_figure_id(figure_slug: str) -> int:
    """
    Find a historical figure's database ID using its stable slug.
    """

    supabase = get_supabase_client()

    response = (
        supabase.table("figures")
        .select("id")
        .eq("slug", figure_slug)
        .single()
        .execute()
    )

    if not response.data:
        raise ValueError(
            f"Figure not found for slug: {figure_slug}"
        )

    return response.data["id"]


def retrieve_chunks(
    question: str,
    figure_slug: str,
    match_count: int = DEFAULT_MATCH_COUNT,
) -> list[dict[str, Any]]:
    """
    Embed a question and retrieve the closest matching chunks.

    Flow:
    1. Resolve the selected historical figure.
    2. Generate an embedding for the question.
    3. Call the Supabase match_chunks SQL function.
    4. Return ranked chunk results.
    """

    cleaned_question = question.strip()

    if not cleaned_question:
        raise ValueError("Question cannot be empty.")

    if match_count <= 0:
        raise ValueError(
            "match_count must be greater than zero."
        )

    figure_id = get_figure_id(figure_slug)

    # A question produces one embedding vector.
    query_embedding = generate_embeddings(
        [cleaned_question]
    )[0]

    supabase = get_supabase_client()

    response = (
        supabase.rpc(
            "match_chunks",
            {
                "query_embedding": query_embedding,
                "match_figure_id": figure_id,
                "match_count": match_count,
            },
        )
        .execute()
    )

    return response.data or []