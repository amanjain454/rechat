import json
from pathlib import Path

from app.ingestion.chunkers import chunk_text
from app.ingestion.loaders import load_text_file
from app.ingestion.token_counter import (
    EMBEDDING_MODEL,
    count_tokens,
)


PROJECT_ROOT = Path(__file__).resolve().parents[2]

SOURCE_FILE = (
    PROJECT_ROOT
    / "data"
    / "raw"
    / "gandhi"
    / "freedoms_battle_1922.txt"
)

OUTPUT_FILE = (
    PROJECT_ROOT
    / "data"
    / "processed"
    / "gandhi"
    / "freedoms_battle_1922_chunks.json"
)

# text-embedding-3-small standard API price:
# $0.02 per 1 million input tokens.
PRICE_PER_MILLION_TOKENS_USD = 0.02


def main() -> None:
    """
    Load the source, create chunks, count tokens, save structured
    records, and estimate the embedding cost.
    """

    text = load_text_file(SOURCE_FILE)

    chunks = chunk_text(
        text=text,
        max_chars=2000,
        overlap_chars=200,
    )

    records: list[dict] = []
    total_tokens = 0

    for index, chunk in enumerate(chunks):
        token_count = count_tokens(chunk)
        total_tokens += token_count

        records.append(
            {
                "chunk_id": (
                    f"gandhi_freedoms_battle_1922_{index:04d}"
                ),
                "figure_slug": "mahatma-gandhi",
                "source_key": "gandhi_freedoms_battle_1922",
                "chunk_index": index,
                "text": chunk,
                "character_count": len(chunk),
                "token_count": token_count,
            }
        )

    estimated_cost = (
        total_tokens / 1_000_000
    ) * PRICE_PER_MILLION_TOKENS_USD

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    OUTPUT_FILE.write_text(
        json.dumps(
            records,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    token_counts = [
        record["token_count"]
        for record in records
    ]

    print(f"Embedding model: {EMBEDDING_MODEL}")
    print(f"Saved chunks: {len(records):,}")
    print(f"Total tokens: {total_tokens:,}")
    print(
        "Average tokens per chunk: "
        f"{total_tokens / len(records):,.1f}"
    )
    print(
        f"Largest chunk: {max(token_counts):,} tokens"
    )
    print(
        f"Smallest chunk: {min(token_counts):,} tokens"
    )
    print(
        "Estimated embedding cost: "
        f"${estimated_cost:.6f}"
    )
    print(f"Output: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()