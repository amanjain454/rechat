import argparse
import csv
import io
import json
from pathlib import Path
from typing import Any

from app.database.client import get_supabase_client
from app.ingestion.embeddings import EMBEDDING_MODEL, generate_embeddings


BATCH_SIZE = 50


def project_root() -> Path:
    # This file lives at:
    #   <project_root>/backend/scripts/ingest_all_chunks.py
    return Path(__file__).resolve().parents[2]


def inventory_path(figure_key: str) -> Path:
    return (
        project_root()
        / "data"
        / "source_inventory"
        / f"{figure_key}_sources.csv"
    )


def raw_dir(figure_key: str) -> Path:
    return project_root() / "data" / "raw" / figure_key


def processed_dir(figure_key: str) -> Path:
    return project_root() / "data" / "processed" / figure_key


def parse_bool(value: str | bool | None) -> bool:
    if isinstance(value, bool):
        return value

    normalized = (value or "").strip().lower()
    return normalized in {"1", "true", "yes", "y"}


def clean_value(row: dict[str, Any], key: str) -> str:
    value = row.get(key)

    if value is None:
        return ""

    return str(value).strip()


def nullable_value(row: dict[str, Any], key: str) -> str | None:
    value = clean_value(row, key)
    return value or None


def read_inventory(figure_key: str) -> list[dict[str, str]]:
    path = inventory_path(figure_key)

    if not path.exists():
        raise FileNotFoundError(f"Inventory not found: {path}")

    raw = path.read_text(encoding="utf-8-sig")

    try:
        dialect = csv.Sniffer().sniff(raw[:4096], delimiters=",\t;")
        delimiter = dialect.delimiter
    except csv.Error:
        delimiter = ","

    rows = list(csv.DictReader(io.StringIO(raw), delimiter=delimiter))

    if not rows:
        raise ValueError(f"Inventory is empty: {path}")

    required = {
        "source_key",
        "title",
        "source_type",
        "source_level",
        "publication_date",
        "original_url",
        "source_owner",
        "language",
        "rights_status",
        "rights_notes",
        "local_filename",
        "approved_for_ingestion",
        "figure_slug",
    }

    missing = required - set(rows[0].keys())

    if missing:
        raise ValueError(
            f"Inventory {path} is missing required columns: "
            + ", ".join(sorted(missing))
        )

    return rows


def get_figure_id(supabase, figure_slug: str) -> int:
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


def upsert_source(
    supabase,
    figure_id: int,
    row: dict[str, str],
) -> int:
    source_key = clean_value(row, "source_key")

    payload = {
        "figure_id": figure_id,
        "source_key": source_key,
        "title": clean_value(row, "title"),
        "author": nullable_value(row, "author"),
        "source_type": clean_value(row, "source_type"),
        "source_level": clean_value(row, "source_level"),
        "publication_date": nullable_value(row, "publication_date"),
        "original_url": nullable_value(row, "original_url"),
        "source_owner": nullable_value(row, "source_owner"),
        "language": clean_value(row, "language") or "English",
        "rights_status": nullable_value(row, "rights_status"),
        "rights_notes": nullable_value(row, "rights_notes"),
        "approved_for_ingestion": True,
    }

    response = (
        supabase.table("sources")
        .upsert(payload, on_conflict="source_key")
        .execute()
    )

    if not response.data:
        # Fallback lookup in case the API response does not return rows.
        lookup = (
            supabase.table("sources")
            .select("id")
            .eq("source_key", source_key)
            .single()
            .execute()
        )

        if not lookup.data:
            raise RuntimeError(f"Could not resolve source row: {source_key}")

        return lookup.data["id"]

    return response.data[0]["id"]


def upsert_document(
    supabase,
    figure_key: str,
    source_id: int,
    local_filename: str,
    character_count: int,
) -> int:
    payload = {
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

        (
            supabase.table("documents")
            .update(payload)
            .eq("id", document_id)
            .execute()
        )

        return document_id

    response = supabase.table("documents").insert(payload).execute()

    if not response.data:
        raise RuntimeError(
            f"Could not create document row for source_id={source_id}"
        )

    return response.data[0]["id"]


def load_chunk_records(
    figure_key: str,
    source_key: str,
    figure_slug: str,
) -> list[dict[str, Any]]:
    path = processed_dir(figure_key) / f"{source_key}_chunks.json"

    if not path.exists():
        raise FileNotFoundError(f"Chunk file not found: {path}")

    records = json.loads(path.read_text(encoding="utf-8"))

    if not isinstance(records, list):
        raise ValueError(f"Chunk file must contain a JSON list: {path}")

    for record in records:
        if record.get("source_key") != source_key:
            raise ValueError(
                f"Chunk source mismatch in {path}: "
                f"expected {source_key}, got {record.get('source_key')}"
            )

        if record.get("figure_slug") != figure_slug:
            raise ValueError(
                f"Chunk figure mismatch in {path}: "
                f"expected {figure_slug}, got {record.get('figure_slug')}"
            )

    return records


def build_chunk_row(
    record: dict[str, Any],
    *,
    document_id: int,
    figure_id: int,
    inventory_row: dict[str, str],
    embedding: list[float],
) -> dict[str, Any]:
    source_key = clean_value(inventory_row, "source_key")

    return {
        "chunk_key": record["chunk_id"],
        "document_id": document_id,
        "figure_id": figure_id,
        "chunk_index": record["chunk_index"],
        "content": record["text"],
        "character_count": record["character_count"],
        "token_count": record["token_count"],
        "embedding": embedding,
        "metadata": {
            "source_key": source_key,
            "source_title": clean_value(inventory_row, "title"),
            "figure_slug": clean_value(inventory_row, "figure_slug"),
            "embedding_model": EMBEDDING_MODEL,
            "publication_date": clean_value(
                inventory_row,
                "publication_date",
            ),
            "source_type": clean_value(inventory_row, "source_type"),
            "language": clean_value(inventory_row, "language") or "English",
        },
    }


def ingest_source(
    supabase,
    figure_key: str,
    row: dict[str, str],
) -> int:
    source_key = clean_value(row, "source_key")
    figure_slug = clean_value(row, "figure_slug")
    local_filename = clean_value(row, "local_filename")

    if not source_key:
        raise ValueError("Inventory row is missing source_key")

    if not figure_slug:
        raise ValueError(f"Missing figure_slug for source: {source_key}")

    if not parse_bool(row.get("approved_for_ingestion")):
        raise ValueError(
            f"Source is not approved for ingestion: {source_key}"
        )

    if not local_filename:
        raise ValueError(
            f"Missing local_filename for source: {source_key}"
        )

    raw_path = raw_dir(figure_key) / local_filename

    if not raw_path.exists():
        raise FileNotFoundError(
            f"Raw source file not found: {raw_path}"
        )

    raw_text = raw_path.read_text(encoding="utf-8")

    chunk_records = load_chunk_records(
        figure_key=figure_key,
        source_key=source_key,
        figure_slug=figure_slug,
    )

    figure_id = get_figure_id(supabase, figure_slug)

    source_id = upsert_source(
        supabase=supabase,
        figure_id=figure_id,
        row=row,
    )

    document_id = upsert_document(
        supabase=supabase,
        figure_key=figure_key,
        source_id=source_id,
        local_filename=local_filename,
        character_count=len(raw_text),
    )

    print(
        f"    figure_id={figure_id} "
        f"source_id={source_id} "
        f"document_id={document_id}"
    )
    print(f"    chunks={len(chunk_records):,}")

    ingested = 0

    for start in range(0, len(chunk_records), BATCH_SIZE):
        batch = chunk_records[start : start + BATCH_SIZE]

        texts = [record["text"] for record in batch]
        embeddings = generate_embeddings(texts)

        if len(embeddings) != len(batch):
            raise RuntimeError(
                f"Embedding count mismatch for {source_key}: "
                f"{len(embeddings)} embeddings for {len(batch)} chunks"
            )

        rows = [
            build_chunk_row(
                record,
                document_id=document_id,
                figure_id=figure_id,
                inventory_row=row,
                embedding=embedding,
            )
            for record, embedding in zip(batch, embeddings)
        ]

        (
            supabase.table("chunks")
            .upsert(rows, on_conflict="chunk_key")
            .execute()
        )

        ingested += len(rows)

        print(
            f"    embedded/upserted "
            f"{ingested:,}/{len(chunk_records):,}"
        )

    return ingested


def ingest_inventory(
    figure_key: str,
    source_key: str | None = None,
) -> None:
    rows = read_inventory(figure_key)

    if source_key:
        matching = [
            row
            for row in rows
            if clean_value(row, "source_key") == source_key
        ]

        if not matching:
            raise ValueError(
                f"Source key '{source_key}' not found in "
                f"{inventory_path(figure_key)}"
            )

        rows = matching
    else:
        # Figure-wide mode: process every approved source.
        approved_rows = [
            row
            for row in rows
            if parse_bool(row.get("approved_for_ingestion"))
        ]

        skipped_unapproved = len(rows) - len(approved_rows)

        if skipped_unapproved:
            print(
                f"Skipping {skipped_unapproved} source(s) not approved "
                f"for ingestion."
            )

        rows = approved_rows

        if not rows:
            raise ValueError(
                f"No approved sources found in {inventory_path(figure_key)}"
            )

    supabase = get_supabase_client()

    print(f"Figure key: {figure_key}")
    print(f"Inventory:  {inventory_path(figure_key)}")
    print(f"Processed:  {processed_dir(figure_key)}")
    print(f"Embedding:  {EMBEDDING_MODEL}")
    print(f"Batch size: {BATCH_SIZE}")
    print(f"Sources:    {len(rows)}")
    print()

    completed = 0
    failed = 0
    total_chunks = 0

    for index, row in enumerate(rows, start=1):
        key = clean_value(row, "source_key")
        language = clean_value(row, "language") or "English"

        print(f"[{index}/{len(rows)}] {key} [{language}]")

        try:
            count = ingest_source(
                supabase=supabase,
                figure_key=figure_key,
                row=row,
            )

            completed += 1
            total_chunks += count
            print(f"    DONE: {count:,} chunks")
        except Exception as exc:
            failed += 1
            print(f"    FAILED: {exc}")

        print()

    print("Ingestion summary")
    print(f"  sources completed: {completed}")
    print(f"  sources failed:    {failed}")
    print(f"  chunks ingested:   {total_chunks:,}")

    if failed:
        raise SystemExit(1)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Embed and ingest RecChat processed chunks into Supabase. "
            "Pass only figure_key to ingest all approved sources, or add "
            "source_key to ingest one source."
        )
    )

    parser.add_argument(
        "figure_key",
        help="Filesystem/inventory key, e.g. einstein, curie, gandhi",
    )

    parser.add_argument(
        "source_key",
        nargs="?",
        default=None,
        help=(
            "Optional source_key. "
            "If omitted, all approved sources for the figure are ingested."
        ),
    )

    args = parser.parse_args()

    ingest_inventory(
        figure_key=args.figure_key,
        source_key=args.source_key,
    )


if __name__ == "__main__":
    main()
