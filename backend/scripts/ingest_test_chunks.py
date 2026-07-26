import json
from pathlib import Path

from app.database.client import get_supabase_client
from app.ingestion.embeddings import generate_embeddings


PROJECT_ROOT = Path(__file__).resolve().parents[2]

CHUNKS_FILE = (
    PROJECT_ROOT
    / "data"
    / "processed"
    / "gandhi"
    / "freedoms_battle_1922_chunks.json"
)

FIGURE_SLUG = "mahatma-gandhi"
SOURCE_KEY = "gandhi_freedoms_battle_1922"
TEST_CHUNK_COUNT = 5


def get_figure_id(supabase) -> int:
    response = (
        supabase.table("figures")
        .select("id")
        .eq("slug", FIGURE_SLUG)
        .single()
        .execute()
    )

    return response.data["id"]


def get_document_id(supabase) -> int:
    source_response = (
        supabase.table("sources")
        .select("id")
        .eq("source_key", SOURCE_KEY)
        .single()
        .execute()
    )

    source_id = source_response.data["id"]

    document_response = (
        supabase.table("documents")
        .select("id")
        .eq("source_id", source_id)
        .single()
        .execute()
    )

    return document_response.data["id"]


def main() -> None:
    supabase = get_supabase_client()

    records = json.loads(
        CHUNKS_FILE.read_text(encoding="utf-8")
    )

    test_records = records[:TEST_CHUNK_COUNT]
    texts = [record["text"] for record in test_records]

    print(f"Preparing {len(test_records)} test chunks")

    figure_id = get_figure_id(supabase)
    document_id = get_document_id(supabase)

    print(f"Figure ID: {figure_id}")
    print(f"Document ID: {document_id}")

    embeddings = generate_embeddings(texts)

    rows = []

    for record, embedding in zip(
        test_records,
        embeddings,
        strict=True,
    ):
        rows.append(
            {
                "chunk_key": record["chunk_id"],
                "document_id": document_id,
                "figure_id": figure_id,
                "chunk_index": record["chunk_index"],
                "content": record["text"],
                "character_count": record["character_count"],
                "token_count": record["token_count"],
                "embedding": embedding,
                "metadata": {
                    "source_key": record["source_key"],
                    "figure_slug": record["figure_slug"],
                    "embedding_model": "text-embedding-3-small",
                },
            }
        )

    response = (
        supabase.table("chunks")
        .upsert(
            rows,
            on_conflict="chunk_key",
        )
        .execute()
    )

    print(f"Rows returned: {len(response.data)}")

    for row in response.data:
        print(
            f"Inserted: {row['chunk_key']} "
            f"(database ID: {row['id']})"
        )

    print()
    print("Five test chunks inserted successfully.")


if __name__ == "__main__":
    main()