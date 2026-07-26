import argparse
from pathlib import Path

from app.ingestion.loaders import load_text_file


PROJECT_ROOT = Path(__file__).resolve().parents[2]
GANDHI_RAW_DIR = PROJECT_ROOT / "data" / "raw" / "gandhi"


def parse_arguments() -> argparse.Namespace:
    """
    Read the source filename supplied through the command line.
    """

    parser = argparse.ArgumentParser(
        description="Inspect a Gandhi source text file."
    )

    parser.add_argument(
        "filename",
        help="Filename inside data/raw/gandhi.",
    )

    return parser.parse_args()


def main() -> None:
    args = parse_arguments()

    source_file = GANDHI_RAW_DIR / args.filename
    text = load_text_file(source_file)
    lines = text.splitlines()

    print(f"File: {source_file}")
    print(f"Characters: {len(text):,}")
    print(f"Lines: {len(lines):,}")
    print()

    print("First 10 lines")
    print("-" * 40)

    for line in lines[:10]:
        print(line)

    print()
    print("Last 10 lines")
    print("-" * 40)

    for line in lines[-10:]:
        print(line)


if __name__ == "__main__":
    main()