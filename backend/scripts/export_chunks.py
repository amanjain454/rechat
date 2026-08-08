import argparse
import csv
import json
from pathlib import Path

from app.ingestion.chunkers import chunk_text
from app.ingestion.loaders import load_text_file
from app.ingestion.token_counter import EMBEDDING_MODEL, count_tokens


PROJECT_ROOT = Path(__file__).resolve().parents[2]
PRICE_PER_MILLION_TOKENS_USD = 0.02


def parse_arguments() -> argparse.Namespace:
    """Read the figure key and source key from the command line."""
    parser = argparse.ArgumentParser(description="Chunk and export one approved source.")
    parser.add_argument("figure_key", help="Figure folder/inventory key, e.g. gandhi or einstein.")
    parser.add_argument("source_key", help="Source key from the figure's source inventory.")
    return parser.parse_args()


def get_figure_paths(figure_key: str) -> tuple[Path, Path, Path]:
    """Build the inventory, raw-data, and processed-data paths for a figure."""
    inventory = PROJECT_ROOT / "data" / "source_inventory" / f"{figure_key}_sources.csv"
    raw_dir = PROJECT_ROOT / "data" / "raw" / figure_key
    processed_dir = PROJECT_ROOT / "data" / "processed" / figure_key
    return inventory, raw_dir, processed_dir


def load_source_record(source_key: str, inventory_file: Path) -> dict[str, str]:
    """Load one source record from the selected figure's source inventory."""
    with inventory_file.open(mode="r", encoding="utf-8-sig", newline="") as csv_file:
        sample = csv_file.read(4096)
        csv_file.seek(0)
        dialect = csv.Sniffer().sniff(sample, delimiters=",\t")
        reader = csv.DictReader(csv_file, dialect=dialect)

        if not reader.fieldnames:
            raise ValueError("The source inventory has no header row.")

        fieldnames = [field.strip() for field in reader.fieldnames if field]
        if "source_key" not in fieldnames:
            raise ValueError(f"The source inventory does not contain 'source_key'. Found: {fieldnames}")

        for row in reader:
            cleaned_row = {
                key.strip(): value.strip()
                for key, value in row.items()
                if key is not None and value is not None
            }

            if cleaned_row.get("source_key") == source_key:
                return cleaned_row

    raise ValueError(f"Source key not found in inventory: {source_key}")


def is_approved(value: str) -> bool:
    """Convert common CSV true values into a boolean approval flag."""
    return value.strip().lower() in {"true", "yes", "1"}


def main() -> None:
    """Load, chunk, tokenize, and export one approved source as JSON."""
    args = parse_arguments()
    inventory_file, raw_dir, processed_dir = get_figure_paths(args.figure_key)
    source = load_source_record(args.source_key, inventory_file)

    figure_slug = source.get("figure_slug", "").strip()
    if not figure_slug:
        raise ValueError(f"No figure_slug configured for source: {args.source_key}")

    if not is_approved(source.get("approved_for_ingestion", "")):
        raise ValueError(f"Source is not approved for ingestion: {args.source_key}")

    local_filename = source.get("local_filename", "")
    if not local_filename:
        raise ValueError(f"No local filename configured for source: {args.source_key}")

    source_file = raw_dir / local_filename
    output_file = processed_dir / f"{Path(local_filename).stem}_chunks.json"

    text = load_text_file(source_file)
    chunks = chunk_text(text=text, max_chars=2000, overlap_chars=200)

    if not chunks:
        raise RuntimeError("Chunking produced no output.")

    records = []
    total_tokens = 0

    for index, chunk in enumerate(chunks):
        token_count = count_tokens(chunk)
        total_tokens += token_count

        records.append({
            "chunk_id": f"{args.source_key}_{index:04d}",
            "figure_slug": figure_slug,
            "source_key": args.source_key,
            "source_title": source["title"],
            "source_type": source.get("source_type", ""),
            "publication_date": source.get("publication_date", ""),
            "chunk_index": index,
            "text": chunk,
            "character_count": len(chunk),
            "token_count": token_count,
        })

    estimated_cost = (total_tokens / 1_000_000) * PRICE_PER_MILLION_TOKENS_USD

    output_file.parent.mkdir(parents=True, exist_ok=True)
    output_file.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")

    token_counts = [record["token_count"] for record in records]

    print(f"Figure: {figure_slug}")
    print(f"Source: {source['title']}")
    print(f"Source key: {args.source_key}")
    print(f"Input: {source_file}")
    print(f"Embedding model: {EMBEDDING_MODEL}")
    print(f"Saved chunks: {len(records):,}")
    print(f"Total tokens: {total_tokens:,}")
    print(f"Average tokens per chunk: {total_tokens / len(records):,.1f}")
    print(f"Largest chunk: {max(token_counts):,} tokens")
    print(f"Smallest chunk: {min(token_counts):,} tokens")
    print(f"Estimated embedding cost: ${estimated_cost:.6f}")
    print(f"Output: {output_file}")


if __name__ == "__main__":
    main()