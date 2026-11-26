import logging
import time
from typing import Any

from app.database.client import get_supabase_client
from app.ingestion.embeddings import generate_embeddings
from app.observability import Observation, record_matches

DEFAULT_MATCH_COUNT = 5

logger = logging.getLogger("uvicorn.error")

# Small in-process cache. /figures primes this at page load, so chat requests
# do not need a second Supabase lookup just to translate slug -> id.
_FIGURE_ID_CACHE: dict[str, int] = {}


def prime_figure_id_cache(figures: list[dict[str, Any]]) -> None:
    """
    Prime slug -> id mappings from an already-fetched figures response.
    """
    for figure in figures:
        slug = figure.get("slug")
        figure_id = figure.get("id")

        if slug and figure_id is not None:
            _FIGURE_ID_CACHE[str(slug)] = int(figure_id)


def known_figure_slug(figure_slug: str) -> str | None:
    """Never export a client-supplied slug until it matches the source index."""
    return figure_slug if figure_slug in _FIGURE_ID_CACHE else None


def get_figure_id(figure_slug: str) -> tuple[int, bool]:
    """
    Resolve a perspective's database ID.

    Returns:
        (figure_id, cache_hit)
    """
    cached_id = _FIGURE_ID_CACHE.get(figure_slug)

    if cached_id is not None:
        return cached_id, True

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
            f"Perspective not found for slug: {figure_slug}"
        )

    figure_id = int(response.data["id"])
    _FIGURE_ID_CACHE[figure_slug] = figure_id

    return figure_id, False


def retrieve_chunks(
    question: str,
    figure_slug: str,
    match_count: int = DEFAULT_MATCH_COUNT,
    *,
    trace: Observation | None = None,
) -> list[dict[str, Any]]:
    """
    Embed a question and retrieve the closest matching chunks.

    PERF logs separate:
    - perspective lookup / cache hit
    - query embedding
    - Supabase client access
    - Supabase vector search
    - total retrieval time
    """
    cleaned_question = question.strip()

    if not cleaned_question:
        raise ValueError("Question cannot be empty.")

    if match_count <= 0:
        raise ValueError(
            "match_count must be greater than zero."
        )

    total_started = time.perf_counter()

    parent = trace if trace is not None else Observation()
    with parent.child("retrieval", "retriever", metadata={"retrieval_strategy": "dense_vector", "requested_chunk_count": match_count}) as observation:
        lookup_started = time.perf_counter()
        figure_id, figure_cache_hit = get_figure_id(
            figure_slug
        )
        parent.annotate(figure_slug=figure_slug)
        parent.preview_input({"figure_slug": figure_slug})
        observation.preview_input({"figure_slug": figure_slug, "requested_chunk_count": match_count, "question_length_chars": len(cleaned_question)}, content={"question": cleaned_question})
        lookup_ms = (
            time.perf_counter() - lookup_started
        ) * 1000

        embedding_started = time.perf_counter()
        query_embedding = generate_embeddings(
            [cleaned_question], trace=observation
        )[0]
        embedding_ms = (
            time.perf_counter() - embedding_started
        ) * 1000

        client_started = time.perf_counter()
        supabase = get_supabase_client()
        supabase_client_ms = (
            time.perf_counter() - client_started
        ) * 1000

        vector_started = time.perf_counter()
        with observation.child("vector_search", metadata={"database_provider": "supabase", "search_method": "match_chunks_rpc"}) as vector:
            vector.preview_input({"figure_id": figure_id, "requested_chunk_count": match_count, "embedding_dimensions": len(query_embedding)})
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
            vector.annotate(match_count=len(response.data or []))
            record_matches(vector, response.data or [], scores=True)
        vector_ms = (
            time.perf_counter() - vector_started
        ) * 1000

        total_ms = (
            time.perf_counter() - total_started
        ) * 1000

        matches = response.data or []

        logger.info(
            (
                "PERF retrieval slug=%s matches=%s "
                "figure_cache_hit=%s figure_lookup_ms=%.1f "
                "embedding_ms=%.1f supabase_client_ms=%.1f "
                "vector_search_ms=%.1f total_ms=%.1f"
            ),
            figure_slug,
            len(matches),
            figure_cache_hit,
            lookup_ms,
            embedding_ms,
            supabase_client_ms,
            vector_ms,
            total_ms,
        )

        observation.annotate(figure_cache_hit=figure_cache_hit)
        record_matches(observation, matches)
        return matches
