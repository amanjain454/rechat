import argparse
import csv
import json
from pathlib import Path
from typing import Any

from app.database.client import get_supabase_client
from app.ingestion.embeddings import (
    EMBEDDING_MODEL,
    generate_embeddings,
)


PROJECT_ROOT = Path(__file__).resolve().parents[2]

SOURCE_INVENTORY_FILE = (
    PROJECT_ROOT
    / "data"
    / "source_inventory"
    / "gandhi_sources.csv"
)

RAW_SOURCE_DIR = (
    PROJECT_ROOT
    / "data"
    / "raw"
    / "gandhi"
)

PROCESSED_SOURCE_DIR = (
    PROJECT_ROOT
    / "data"
    / "processed"
    / "gandhi"
)

FIGURE_SLUG = "mahatma-gandhi"
BATCH_SIZE = 50


def parse_arguments() -> argparse.Namespace:
    """
    Read the source key supplied through the command line.
    """

    parser = argparse.ArgumentParser(
        description=(
            "Generate embeddings and ingest one approved "
            "Gandhi source into Supabase."
        )
    )

    parser.add_argument(
        "source_key",
        help="Source key from gandhi_sources.csv.",
    )

    return parser.parse_args()


def is_approved(value: str) -> bool:
    """
    Interpret common true values from the source inventory.
    """

    return value.strip().lower() in {
        "true",
        "yes",
        "1",
    }


def load_source_record(
    source_key: str,
) -> dict[str, str]:
    """
    Find one source in the Gandhi source inventory.

    The inventory may be comma-separated or tab-separated.
    """

    with SOURCE_INVENTORY_FILE.open(
        mode="r",
        encoding="utf-8-sig",
        newline="",
    ) as csv_file:
        sample = csv_file.read(4096)
        csv_file.seek(0)

        dialect = csv.Sniffer().sniff(
            sample,
            delimiters=",\t",
        )

        reader = csv.DictReader(
            csv_file,
            dialect=dialect,
        )

        if not reader.fieldnames:
            raise ValueError(
                "The source inventory has no header row."
            )

        for row in reader:
            cleaned_row = {
                key.strip(): value.strip()
                for key, value in row.items()
                if key is not None and value is not None
            }

            if (
                cleaned_row.get("source_key")
                == source_key
            ):
                return cleaned_row

    raise ValueError(
        f"Source key not found in inventory: {source_key}"
    )


def get_figure_id(
    supabase: Any,
) -> int:
    """
    Find Gandhi's database ID using the stable figure slug.
    """

    response = (
        supabase.table("figures")
        .select("id")
        .eq("slug", FIGURE_SLUG)
        .single()
        .execute()
    )

    if not response.data:
        raise ValueError(
            f"Figure not found: {FIGURE_SLUG}"
        )

    return response.data["id"]


def upsert_source(
    supabase: Any,
    source: dict[str, str],
    figure_id: int,
) -> int:
    """
    Create or update the source record and return its ID.
    """

    source_row = {
        "figure_id": figure_id,
        "source_key": source["source_key"],
        "title": source["title"],
        "author": source["author"],
        "source_type": source["source_type"],
        "source_level": source["source_level"],
        "publication_date": (
            source.get("publication_date") or None
        ),
        "original_url": source["original_url"],
        "source_owner": source["source_owner"],
        "language": source["language"],
        "rights_status": source["rights_status"],
        "rights_notes": source["rights_notes"],
        "approved_for_ingestion": True,
    }

    response = (
        supabase.table("sources")
        .upsert(
            source_row,
            on_conflict="source_key",
        )
        .execute()
    )

    if response.data:
        return response.data[0]["id"]

    lookup_response = (
        supabase.table("sources")
        .select("id")
        .eq(
            "source_key",
            source["source_key"],
        )
        .single()
        .execute()
    )

    return lookup_response.data["id"]


def upsert_document(
    supabase: Any,
    source: dict[str, str],
    source_id: int,
    character_count: int,
) -> int:
    """
    Create or update the document record and return its ID.
    """

    local_filename = source["local_filename"]

    document_row = {
        "source_id": source_id,
        "file_name": local_filename,
        "storage_path": (
            f"gandhi/{local_filename}"
        ),
        "file_type": "text/plain",
        "extraction_status": "processed",
        "character_count": character_count,
    }

    # First check whether this source already has a document.
    existing_response = (
        supabase.table("documents")
        .select("id")
        .eq("source_id", source_id)
        .limit(1)
        .execute()
    )

    if existing_response.data:
        document_id = existing_response.data[0]["id"]

        (
            supabase.table("documents")
            .update(document_row)
            .eq("id", document_id)
            .execute()
        )

        return document_id

    response = (
        supabase.table("documents")
        .insert(document_row)
        .execute()
    )

    if not response.data:
        raise RuntimeError(
            "Document insertion returned no row."
        )

    return response.data[0]["id"]


def load_chunk_records(
    source: dict[str, str],
) -> list[dict[str, Any]]:
    """
    Load the processed chunk JSON for the selected source.
    """

    local_filename = source["local_filename"]

    chunks_filename = (
        f"{Path(local_filename).stem}_chunks.json"
    )

    chunks_file = (
        PROCESSED_SOURCE_DIR
        / chunks_filename
    )

    if not chunks_file.exists():
        raise FileNotFoundError(
            "Processed chunk file not found: "
            f"{chunks_file}"
        )

    records = json.loads(
        chunks_file.read_text(
            encoding="utf-8"
        )
    )

    if not records:
        raise ValueError(
            f"No chunks found in: {chunks_file}"
        )

    for record in records:
        if (
            record.get("source_key")
            != source["source_key"]
        ):
            raise ValueError(
                "Chunk source key does not match "
                f"the selected source: {chunks_file}"
            )

    return records


def get_raw_character_count(
    source: dict[str, str],
) -> int:
    """
    Read the raw source file and return its character count.
    """

    source_file = (
        RAW_SOURCE_DIR
        / source["local_filename"]
    )

    if not source_file.exists():
        raise FileNotFoundError(
            f"Raw source file not found: {source_file}"
        )

    text = source_file.read_text(
        encoding="utf-8-sig"
    )

    return len(text)


def build_chunk_rows(
    records: list[dict[str, Any]],
    embeddings: list[list[float]],
    figure_id: int,
    document_id: int,
    source: dict[str, str],
) -> list[dict[str, Any]]:
    """
    Combine chunk records and embeddings into Supabase rows.
    """

    rows: list[dict[str, Any]] = []

    for record, embedding in zip(
        records,
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
                "character_count": (
                    record["character_count"]
                ),
                "token_count": (
                    record["token_count"]
                ),
                "embedding": embedding,
                "metadata": {
                    "source_key": source["source_key"],
                    "source_title": source["title"],
                    "figure_slug": FIGURE_SLUG,
                    "embedding_model": EMBEDDING_MODEL,
                    "publication_date": source.get(
                        "publication_date",
                        "",
                    ),
                    "source_type": source.get(
                        "source_type",
                        "",
                    ),
                },
            }
        )

    return rows


def main() -> None:
    """
    Ingest one complete source into Supabase.

    Flow:
    1. Read source metadata from the CSV.
    2. Validate that the source is approved.
    3. Load the processed chunks.
    4. Create or update source and document records.
    5. Generate embeddings in batches.
    6. Upsert all chunk rows.
    """

    args = parse_arguments()

    source = load_source_record(
        args.source_key
    )

    if not is_approved(
        source.get(
            "approved_for_ingestion",
            "",
        )
    ):
        raise ValueError(
            "Source is not approved for ingestion: "
            f"{args.source_key}"
        )

    records = load_chunk_records(source)
    character_count = get_raw_character_count(source)

    supabase = get_supabase_client()

    figure_id = get_figure_id(supabase)

    source_id = upsert_source(
        supabase=supabase,
        source=source,
        figure_id=figure_id,
    )

    document_id = upsert_document(
        supabase=supabase,
        source=source,
        source_id=source_id,
        character_count=character_count,
    )

    total_chunks = len(records)

    print(f"Source: {source['title']}")
    print(f"Source key: {source['source_key']}")
    print(f"Embedding model: {EMBEDDING_MODEL}")
    print(f"Total chunks: {total_chunks:,}")
    print(f"Batch size: {BATCH_SIZE}")
    print(f"Figure ID: {figure_id}")
    print(f"Source ID: {source_id}")
    print(f"Document ID: {document_id}")
    print()

    for batch_start in range(
        0,
        total_chunks,
        BATCH_SIZE,
    ):
        batch_end = min(
            batch_start + BATCH_SIZE,
            total_chunks,
        )

        batch_records = records[
            batch_start:batch_end
        ]

        texts = [
            record["text"]
            for record in batch_records
        ]

        print(
            "Processing chunks "
            f"{batch_start} through "
            f"{batch_end - 1}"
        )

        embeddings = generate_embeddings(
            texts
        )

        rows = build_chunk_rows(
            records=batch_records,
            embeddings=embeddings,
            figure_id=figure_id,
            document_id=document_id,
            source=source,
        )

        response = (
            supabase.table("chunks")
            .upsert(
                rows,
                on_conflict="chunk_key",
            )
            .execute()
        )

        print(
            f"Stored {len(response.data)} rows "
            f"({batch_end}/{total_chunks} complete)"
        )
        print()

    print(
        f"Successfully ingested: "
        f"{source['title']}"
    )


if __name__ == "__main__":
    main()