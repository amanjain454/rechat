from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI


BACKEND_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(BACKEND_ROOT / ".env")


EMBEDDING_MODEL = "text-embedding-3-small"
EXPECTED_DIMENSIONS = 1536


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

    client = OpenAI()

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