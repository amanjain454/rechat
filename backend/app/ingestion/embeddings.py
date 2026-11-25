from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI


BACKEND_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_ROOT / ".env")


EMBEDDING_MODEL = "text-embedding-3-small"
EXPECTED_DIMENSIONS = 1536


@lru_cache(maxsize=1)
def get_openai_client() -> OpenAI:
    """
    Create and cache one OpenAI client for backend use.

    Reusing the client avoids rebuilding the underlying HTTP client
    and connection pool for every embedding request.
    """
    return OpenAI()


def generate_embeddings(
    texts: list[str],
) -> list[list[float]]:
    """
    Generate one embedding vector for each supplied text.
    """

    if not texts:
        raise ValueError("At least one text is required.")

    if any(not text.strip() for text in texts):
        raise ValueError("Embedding inputs cannot be empty.")

    client = get_openai_client()

    response = client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=texts,
    )

    embeddings = [
        item.embedding
        for item in response.data
    ]

    if len(embeddings) != len(texts):
        raise RuntimeError(
            "The number of embeddings does not match "
            "the number of input texts."
        )

    for embedding in embeddings:
        if len(embedding) != EXPECTED_DIMENSIONS:
            raise RuntimeError(
                f"Expected {EXPECTED_DIMENSIONS} dimensions, "
                f"received {len(embedding)}."
            )

    return embeddings
