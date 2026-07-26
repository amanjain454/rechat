import argparse
import csv
import json
from pathlib import Path

from app.ingestion.chunkers import chunk_text
from app.ingestion.loaders import load_text_file
from app.ingestion.token_counter import (
    EMBEDDING_MODEL,
    count_tokens,
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

PRICE_PER_MILLION_TOKENS_USD = 0.02


def parse_arguments() -> argparse.Namespace:
    """
    Read the source key supplied through the command line.
    """

    parser = argparse.ArgumentParser(
        description=(
            "Chunk and export one approved Gandhi source."
        )
    )

    parser.add_argument(
        "source_key",
        help="Source key from gandhi_sources.csv.",
    )

    return parser.parse_args()


def load_source_record(
    source_key: str,
) -> dict[str, str]:
    """
    Find one source record in the Gandhi source inventory.

    The file may be comma-separated or tab-separated depending
    on how it was saved from Excel.
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

        fieldnames = [
            field.strip()
            for field in reader.fieldnames
            if field
        ]

        if "source_key" not in fieldnames:
            raise ValueError(
                "The source inventory does not contain a "
                f"'source_key' column. Found: {fieldnames}"
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


def is_approved(value: str) -> bool:
    """
    Interpret common true values from the inventory.
    """

    return value.strip().lower() in {
        "true",
        "yes",
        "1",
    }


def main() -> None:
    """
    Load one approved source, chunk it, count tokens,
    and export structured JSON records.
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

    local_filename = source.get(
        "local_filename",
        "",
    )

    if not local_filename:
        raise ValueError(
            "No local filename configured for source: "
            f"{args.source_key}"
        )

    source_file = (
        RAW_SOURCE_DIR
        / local_filename
    )

    output_filename = (
        f"{Path(local_filename).stem}_chunks.json"
    )

    output_file = (
        PROCESSED_SOURCE_DIR
        / output_filename
    )

    text = load_text_file(
        source_file
    )

    chunks = chunk_text(
        text=text,
        max_chars=2000,
        overlap_chars=200,
    )

    if not chunks:
        raise RuntimeError(
            "Chunking produced no output."
        )

    records: list[dict] = []
    total_tokens = 0

    for index, chunk in enumerate(
        chunks
    ):
        token_count = count_tokens(
            chunk
        )

        total_tokens += token_count

        records.append(
            {
                "chunk_id": (
                    f"{args.source_key}_{index:04d}"
                ),
                "figure_slug": (
                    "mahatma-gandhi"
                ),
                "source_key": (
                    args.source_key
                ),
                "source_title": (
                    source["title"]
                ),
                "source_type": (
                    source.get(
                        "source_type",
                        "",
                    )
                ),
                "publication_date": (
                    source.get(
                        "publication_date",
                        "",
                    )
                ),
                "chunk_index": index,
                "text": chunk,
                "character_count": len(chunk),
                "token_count": token_count,
            }
        )

    estimated_cost = (
        total_tokens
        / 1_000_000
    ) * PRICE_PER_MILLION_TOKENS_USD

    output_file.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    output_file.write_text(
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

    print(
        f"Source: {source['title']}"
    )
    print(
        f"Source key: {args.source_key}"
    )
    print(
        f"Input: {source_file}"
    )
    print(
        f"Embedding model: {EMBEDDING_MODEL}"
    )
    print(
        f"Saved chunks: {len(records):,}"
    )
    print(
        f"Total tokens: {total_tokens:,}"
    )
    print(
        "Average tokens per chunk: "
        f"{total_tokens / len(records):,.1f}"
    )
    print(
        "Largest chunk: "
        f"{max(token_counts):,} tokens"
    )
    print(
        "Smallest chunk: "
        f"{min(token_counts):,} tokens"
    )
    print(
        "Estimated embedding cost: "
        f"${estimated_cost:.6f}"
    )
    print(
        f"Output: {output_file}"
    )


if __name__ == "__main__":
    main()