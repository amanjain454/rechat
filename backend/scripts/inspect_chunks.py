from pathlib import Path

from app.ingestion.chunkers import chunk_text
from app.ingestion.loaders import load_text_file


PROJECT_ROOT = Path(__file__).resolve().parents[2]

SOURCE_FILE = (
    PROJECT_ROOT
    / "data"
    / "raw"
    / "gandhi"
    / "freedoms_battle_1922.txt"
)


def main() -> None:
    """
    Load Freedom's Battle, split it into chunks,
    and print basic chunk statistics.
    """

    text = load_text_file(SOURCE_FILE)

    chunks = chunk_text(
        text=text,
        max_chars=2000,
        overlap_chars=200,
    )

    chunk_lengths = [len(chunk) for chunk in chunks]

    print(f"Source file: {SOURCE_FILE}")
    print(f"Total document characters: {len(text):,}")
    print(f"Number of chunks: {len(chunks):,}")
    print(f"Shortest chunk: {min(chunk_lengths):,} characters")
    print(f"Longest chunk: {max(chunk_lengths):,} characters")
    print(
        f"Average chunk length: "
        f"{sum(chunk_lengths) / len(chunk_lengths):,.1f} characters"
    )

    print()
    print("FIRST CHUNK")
    print("-" * 60)
    print(chunks[0])

    print()
    print("SECOND CHUNK")
    print("-" * 60)
    print(chunks[1])

    print()
    print("LAST CHUNK")
    print("-" * 60)
    print(chunks[-1])


if __name__ == "__main__":
    main()