import argparse
import csv
import io
import json
from pathlib import Path

try:
    import tiktoken
except ImportError:
    tiktoken = None

from app.ingestion.chunkers import chunk_text


MAX_CHARS = 2000
OVERLAP_CHARS = 200


def project_root() -> Path:
    # This file lives at:
    #   <project_root>/backend/scripts/export_chunks.py
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
        "publication_date",
        "local_filename",
        "figure_slug",
    }
    missing = required - set(rows[0].keys())

    if missing:
        raise ValueError(
            f"Inventory {path} is missing required columns: "
            + ", ".join(sorted(missing))
        )

    return rows


def get_token_counter():
    if tiktoken is None:
        return None

    try:
        return tiktoken.get_encoding("cl100k_base")
    except Exception:
        return None


TOKENIZER = get_token_counter()


def count_tokens(text: str) -> int:
    if TOKENIZER is not None:
        return len(TOKENIZER.encode(text))

    # Fallback only if tiktoken is unavailable.
    return len(text.split())


def clean_value(row: dict[str, str], key: str) -> str:
    return (row.get(key) or "").strip()


def export_source(
    figure_key: str,
    row: dict[str, str],
) -> tuple[int, Path]:
    source_key = clean_value(row, "source_key")
    local_filename = clean_value(row, "local_filename")

    if not source_key:
        raise ValueError("Inventory row has no source_key")

    if not local_filename:
        raise ValueError(f"{source_key}: inventory row has no local_filename")

    input_path = raw_dir(figure_key) / local_filename

    if not input_path.exists():
        raise FileNotFoundError(
            f"{source_key}: raw source file not found: {input_path}"
        )

    text = input_path.read_text(encoding="utf-8")

    chunks = chunk_text(
        text=text,
        max_chars=MAX_CHARS,
        overlap_chars=OVERLAP_CHARS,
    )

    records: list[dict] = []

    for index, chunk in enumerate(chunks):
        chunk = chunk.strip()

        if not chunk:
            continue

        record = {
            "chunk_id": f"{source_key}_{index:04d}",
            "figure_slug": clean_value(row, "figure_slug"),
            "source_key": source_key,
            "source_title": clean_value(row, "title"),
            "source_type": clean_value(row, "source_type"),
            "publication_date": clean_value(row, "publication_date"),
            "language": clean_value(row, "language") or "English",
            "chunk_index": index,
            "text": chunk,
            "character_count": len(chunk),
            "token_count": count_tokens(chunk),
            "chunking": {
                "strategy": "paragraph_aware_character",
                "version": "v1",
                "max_chars": MAX_CHARS,
                "overlap_chars": OVERLAP_CHARS,
            },
        }

        records.append(record)

    output_directory = processed_dir(figure_key)
    output_directory.mkdir(parents=True, exist_ok=True)

    output_path = output_directory / f"{source_key}_chunks.json"

    output_path.write_text(
        json.dumps(records, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    return len(records), output_path


def export_figure(
    figure_key: str,
    source_key: str | None = None,
) -> None:
    rows = read_inventory(figure_key)

    if source_key:
        rows = [
            row
            for row in rows
            if clean_value(row, "source_key") == source_key
        ]

        if not rows:
            raise ValueError(
                f"Source key '{source_key}' not found in "
                f"{inventory_path(figure_key)}"
            )

    print(f"Figure:    {figure_key}")
    print(f"Inventory: {inventory_path(figure_key)}")
    print(f"Raw:       {raw_dir(figure_key)}")
    print(f"Processed: {processed_dir(figure_key)}")
    print(f"Chunking:  max_chars={MAX_CHARS}, overlap_chars={OVERLAP_CHARS}")
    print()

    total_chunks = 0
    completed = 0
    failed = 0

    for index, row in enumerate(rows, start=1):
        key = clean_value(row, "source_key")
        language = clean_value(row, "language") or "English"

        print(f"[{index}/{len(rows)}] {key} [{language}]")

        try:
            count, path = export_source(figure_key, row)
            completed += 1
            total_chunks += count
            print(f"    chunks={count:,}")
            print(f"    saved={path}")
        except Exception as exc:
            failed += 1
            print(f"    FAILED: {exc}")

    print()
    print("Chunking summary")
    print(f"  sources completed: {completed}")
    print(f"  sources failed:    {failed}")
    print(f"  total chunks:      {total_chunks:,}")

    if failed:
        raise SystemExit(1)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export RecChat raw source text into chunk JSON files."
    )
    parser.add_argument(
        "figure_key",
        help="Figure inventory key, e.g. einstein, curie, nasa",
    )
    parser.add_argument(
        "source_key",
        nargs="?",
        default=None,
        help=(
            "Optional single source_key. "
            "Omit it to chunk every source in the figure inventory."
        ),
    )

    args = parser.parse_args()

    export_figure(
        figure_key=args.figure_key,
        source_key=args.source_key,
    )


if __name__ == "__main__":
    main()
