import json
from pathlib import Path

from app.ingestion.embeddings import (
    EMBEDDING_MODEL,
    generate_embeddings,
)


PROJECT_ROOT = Path(__file__).resolve().parents[2] #looks a potential risk, we might need to change it in future. 

CHUNKS_FILE = (
    PROJECT_ROOT
    / "data"
    / "processed"
    / "gandhi"
    / "freedoms_battle_1922_chunks.json"
)

TEST_CHUNK_COUNT = 5


def main() -> None:
    records = json.loads(
        CHUNKS_FILE.read_text(encoding="utf-8")
    )

    test_records = records[:TEST_CHUNK_COUNT]
    texts = [record["text"] for record in test_records]

    print(f"Embedding model: {EMBEDDING_MODEL}")
    print(f"Chunks being embedded: {len(texts)}")

    embeddings = generate_embeddings(texts)

    print(f"Embeddings returned: {len(embeddings)}")

    for record, embedding in zip(
        test_records,
        embeddings,
        strict=True,
    ):
        print(
            f"{record['chunk_id']}: "
            f"{len(embedding):,} dimensions"
        )

    print()
    print("Embedding test completed successfully.")


if __name__ == "__main__":
    main()