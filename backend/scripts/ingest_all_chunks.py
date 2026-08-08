import argparse
import csv
import json
from pathlib import Path
from typing import Any

from app.database.client import get_supabase_client
from app.ingestion.embeddings import EMBEDDING_MODEL, generate_embeddings


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BATCH_SIZE = 50


def parse_arguments() -> argparse.Namespace:
    """Read the figure key and source key from the command line."""
    parser = argparse.ArgumentParser(description="Generate embeddings and ingest one approved source into Supabase.")
    parser.add_argument("figure_key", help="Figure folder/inventory key, e.g. gandhi or einstein.")
    parser.add_argument("source_key", help="Source key from the figure's source inventory.")
    return parser.parse_args()


def get_figure_paths(figure_key: str) -> tuple[Path, Path, Path]:
    """Build the inventory, raw-data, and processed-data paths for a figure."""
    inventory = PROJECT_ROOT / "data" / "source_inventory" / f"{figure_key}_sources.csv"
    raw_dir = PROJECT_ROOT / "data" / "raw" / figure_key
    processed_dir = PROJECT_ROOT / "data" / "processed" / figure_key
    return inventory, raw_dir, processed_dir


def is_approved(value: str) -> bool:
    """Convert common CSV true values into a boolean approval flag."""
    return value.strip().lower() in {"true", "yes", "1"}


def load_source_record(source_key: str, inventory_file: Path) -> dict[str, str]:
    """Load one source record from the selected figure's source inventory."""
    with inventory_file.open(mode="r", encoding="utf-8-sig", newline="") as csv_file:
        sample = csv_file.read(4096)
        csv_file.seek(0)
        dialect = csv.Sniffer().sniff(sample, delimiters=",\t")
        reader = csv.DictReader(csv_file, dialect=dialect)

        if not reader.fieldnames:
            raise ValueError("The source inventory has no header row.")

        for row in reader:
            cleaned_row = {
                key.strip(): value.strip()
                for key, value in row.items()
                if key is not None and value is not None
            }

            if cleaned_row.get("source_key") == source_key:
                return cleaned_row

    raise ValueError(f"Source key not found in inventory: {source_key}")


def get_figure_id(supabase: Any, figure_slug: str) -> int:
    """Find the database figure ID using its stable figure slug."""
    response = (
        supabase.table("figures")
        .select("id")
        .eq("slug", figure_slug)
        .single()
        .execute()
    )

    if not response.data:
        raise ValueError(f"Figure not found: {figure_slug}")

    return response.data["id"]


def upsert_source(supabase: Any, source: dict[str, str], figure_id: int) -> int:
    """Create or update the source record and return its database ID."""
    source_row = {
        "figure_id": figure_id,
        "source_key": source["source_key"],
        "title": source["title"],
        "author": source["author"],
        "source_type": source["source_type"],
        "source_level": source["source_level"],
        "publication_date": source.get("publication_date") or None,
        "original_url": source["original_url"],
        "source_owner": source["source_owner"],
        "language": source["language"],
        "rights_status": source["rights_status"],
        "rights_notes": source["rights_notes"],
        "approved_for_ingestion": True,
    }

    response = supabase.table("sources").upsert(source_row, on_conflict="source_key").execute()

    if response.data:
        return response.data[0]["id"]

    lookup = (
        supabase.table("sources")
        .select("id")
        .eq("source_key", source["source_key"])
        .single()
        .execute()
    )

    return lookup.data["id"]


def upsert_document(
    supabase: Any,
    source: dict[str, str],
    source_id: int,
    character_count: int,
    figure_key: str,
) -> int:
    """Create or update the document record and return its database ID."""
    local_filename = source["local_filename"]

    document_row = {
        "source_id": source_id,
        "file_name": local_filename,
        "storage_path": f"{figure_key}/{local_filename}",
        "file_type": "text/plain",
        "extraction_status": "processed",
        "character_count": character_count,
    }

    existing = (
        supabase.table("documents")
        .select("id")
        .eq("source_id", source_id)
        .limit(1)
        .execute()
    )

    if existing.data:
        document_id = existing.data[0]["id"]
        supabase.table("documents").update(document_row).eq("id", document_id).execute()
        return document_id

    response = supabase.table("documents").insert(document_row).execute()

    if not response.data:
        raise RuntimeError("Document insertion returned no row.")

    return response.data[0]["id"]


def load_chunk_records(
    source: dict[str, str],
    processed_dir: Path,
    figure_slug: str,
) -> list[dict[str, Any]]:
    """Load and validate the processed chunk JSON for one source."""
    local_filename = source["local_filename"]
    chunks_file = processed_dir / f"{Path(local_filename).stem}_chunks.json"

    if not chunks_file.exists():
        raise FileNotFoundError(f"Processed chunk file not found: {chunks_file}")

    records = json.loads(chunks_file.read_text(encoding="utf-8"))

    if not records:
        raise ValueError(f"No chunks found in: {chunks_file}")

    for record in records:
        if record.get("source_key") != source["source_key"]:
            raise ValueError(f"Chunk source key does not match selected source: {chunks_file}")

        if record.get("figure_slug") != figure_slug:
            raise ValueError(f"Chunk figure slug does not match selected figure: {chunks_file}")

    return records


def get_raw_character_count(source: dict[str, str], raw_dir: Path) -> int:
    """Read the raw source file and return its character count."""
    source_file = raw_dir / source["local_filename"]

    if not source_file.exists():
        raise FileNotFoundError(f"Raw source file not found: {source_file}")

    return len(source_file.read_text(encoding="utf-8-sig"))


def build_chunk_rows(
    records: list[dict[str, Any]],
    embeddings: list[list[float]],
    figure_id: int,
    document_id: int,
    source: dict[str, str],
    figure_slug: str,
) -> list[dict[str, Any]]:
    """Combine processed chunks and embeddings into Supabase chunk rows."""
    rows = []

    for record, embedding in zip(records, embeddings, strict=True):
        rows.append({
            "chunk_key": record["chunk_id"],
            "document_id": document_id,
            "figure_id": figure_id,
            "chunk_index": record["chunk_index"],
            "content": record["text"],
            "character_count": record["character_count"],
            "token_count": record["token_count"],
            "embedding": embedding,
            "metadata": {
                "source_key": source["source_key"],
                "source_title": source["title"],
                "figure_slug": figure_slug,
                "embedding_model": EMBEDDING_MODEL,
                "publication_date": source.get("publication_date", ""),
                "source_type": source.get("source_type", ""),
            },
        })

    return rows


def main() -> None:
    """Load one processed source, embed its chunks, and ingest everything into Supabase."""
    args = parse_arguments()
    inventory_file, raw_dir, processed_dir = get_figure_paths(args.figure_key)

    source = load_source_record(args.source_key, inventory_file)

    figure_slug = source.get("figure_slug", "").strip()
    if not figure_slug:
        raise ValueError(f"No figure_slug configured for source: {args.source_key}")

    if not is_approved(source.get("approved_for_ingestion", "")):
        raise ValueError(f"Source is not approved for ingestion: {args.source_key}")

    records = load_chunk_records(source, processed_dir, figure_slug)
    character_count = get_raw_character_count(source, raw_dir)

    supabase = get_supabase_client()
    figure_id = get_figure_id(supabase, figure_slug)
    source_id = upsert_source(supabase, source, figure_id)

    document_id = upsert_document(
        supabase=supabase,
        source=source,
        source_id=source_id,
        character_count=character_count,
        figure_key=args.figure_key,
    )

    total_chunks = len(records)

    print(f"Figure: {figure_slug}")
    print(f"Source: {source['title']}")
    print(f"Source key: {source['source_key']}")
    print(f"Embedding model: {EMBEDDING_MODEL}")
    print(f"Total chunks: {total_chunks:,}")
    print(f"Batch size: {BATCH_SIZE}")
    print(f"Figure ID: {figure_id}")
    print(f"Source ID: {source_id}")
    print(f"Document ID: {document_id}")
    print()

    for batch_start in range(0, total_chunks, BATCH_SIZE):
        batch_end = min(batch_start + BATCH_SIZE, total_chunks)
        batch_records = records[batch_start:batch_end]
        texts = [record["text"] for record in batch_records]

        print(f"Processing chunks {batch_start} through {batch_end - 1}")

        embeddings = generate_embeddings(texts)

        rows = build_chunk_rows(
            records=batch_records,
            embeddings=embeddings,
            figure_id=figure_id,
            document_id=document_id,
            source=source,
            figure_slug=figure_slug,
        )

        response = supabase.table("chunks").upsert(rows, on_conflict="chunk_key").execute()

        print(f"Stored {len(response.data)} rows ({batch_end}/{total_chunks} complete)")
        print()

    print(f"Successfully ingested: {source['title']}")


if __name__ == "__main__":
    main()