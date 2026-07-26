from pathlib import Path

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
    text = load_text_file(SOURCE_FILE)
    lines = text.splitlines()

    print(f"File: {SOURCE_FILE}")
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