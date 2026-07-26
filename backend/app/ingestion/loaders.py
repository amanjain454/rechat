from pathlib import Path


def load_text_file(file_path: str | Path) -> str:
    """
    Read a UTF-8 text file and return its contents.
    """

    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")

    text = path.read_text(encoding="utf-8-sig")

    if not text.strip():
        raise ValueError(f"File is empty: {path}")

    return text