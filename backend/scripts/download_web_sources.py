import argparse
import csv
import io
import random
import re
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup
from pypdf import PdfReader


MIN_TEXT_CHARS = 1_000
REQUEST_TIMEOUT_SECONDS = 60
MAX_RETRIES = 5
BASE_RETRY_SECONDS = 2.0
SOURCE_DELAY_SECONDS = 1.5


def project_root() -> Path:
    # download_web_sources.py lives in:
    #   <project_root>/backend/scripts/download_web_sources.py
    # so parents[2] is the RecChat project root.
    return Path(__file__).resolve().parents[2]


def inventory_path(figure_key: str) -> Path:
    return project_root() / "data" / "source_inventory" / f"{figure_key}_sources.csv"


def output_dir(figure_key: str) -> Path:
    return project_root() / "data" / "raw" / figure_key


def read_inventory(figure_key: str) -> list[dict[str, str]]:
    path = inventory_path(figure_key)

    if not path.exists():
        raise FileNotFoundError(f"Inventory not found: {path}")

    raw = path.read_text(encoding="utf-8-sig")

    # Support both comma-separated and tab-separated inventories.
    try:
        dialect = csv.Sniffer().sniff(raw[:4096], delimiters=",\t;")
        delimiter = dialect.delimiter
    except csv.Error:
        delimiter = ","

    rows = list(csv.DictReader(io.StringIO(raw), delimiter=delimiter))

    required = {"source_key", "original_url", "local_filename"}
    missing = required - set(rows[0].keys() if rows else [])

    if missing:
        raise ValueError(
            f"Inventory {path} is missing required columns: "
            + ", ".join(sorted(missing))
        )

    return rows


def encode_url(url: str) -> str:
    """
    Percent-encode Unicode characters in URLs while preserving normal URL
    separators and any existing percent escapes.

    Example:
        https://fr.wikisource.org/wiki/Traité_de_radioactivité/Tome_1/1

    becomes:
        https://fr.wikisource.org/wiki/Trait%C3%A9_de_radioactivit%C3%A9/Tome_1/1
    """
    return quote(url.strip(), safe=":/?&=#%")


def make_request(url: str) -> Request:
    encoded_url = encode_url(url)

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/131.0.0.0 Safari/537.36"
        ),
        "Accept": (
            "text/html,application/xhtml+xml,application/xml;q=0.9,"
            "application/pdf;q=0.8,*/*;q=0.7"
        ),
        # French is included so French-language sites do not get an
        # unnecessarily English-only preference.
        "Accept-Language": "en-US,en;q=0.9,fr;q=0.8",
        "Connection": "close",
    }

    return Request(encoded_url, headers=headers)


def retry_delay_seconds(attempt: int, retry_after: str | None = None) -> float:
    if retry_after:
        try:
            return max(float(retry_after), 0.0)
        except ValueError:
            pass

    # Exponential backoff with a little jitter.
    return BASE_RETRY_SECONDS * (2 ** attempt) + random.uniform(0.0, 1.0)


def fetch_url(url: str) -> tuple[bytes, str]:
    last_error: Exception | None = None

    for attempt in range(MAX_RETRIES):
        request = make_request(url)

        try:
            with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
                data = response.read()
                content_type = response.headers.get("Content-Type", "")
                return data, content_type

        except HTTPError as exc:
            last_error = exc

            # Retry rate limits and temporary server errors.
            if exc.code == 429 or 500 <= exc.code < 600:
                retry_after = exc.headers.get("Retry-After")
                delay = retry_delay_seconds(attempt, retry_after)

                print(
                    f"    HTTP {exc.code}; retrying in {delay:.1f}s "
                    f"({attempt + 1}/{MAX_RETRIES})"
                )
                time.sleep(delay)
                continue

            raise

        except (URLError, TimeoutError, ConnectionError) as exc:
            last_error = exc
            delay = retry_delay_seconds(attempt)

            print(
                f"    Network error: {exc}; retrying in {delay:.1f}s "
                f"({attempt + 1}/{MAX_RETRIES})"
            )
            time.sleep(delay)

    raise RuntimeError(
        f"Failed to download after {MAX_RETRIES} attempts: {url}"
    ) from last_error


def looks_like_pdf(url: str, content_type: str, data: bytes) -> bool:
    path = urlparse(url).path.lower()

    return (
        path.endswith(".pdf")
        or "application/pdf" in content_type.lower()
        or data[:5] == b"%PDF-"
    )


def normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\xa0", " ")

    # Normalize horizontal whitespace while preserving paragraph boundaries.
    lines = []
    for line in text.splitlines():
        line = re.sub(r"[ \t]+", " ", line).strip()
        lines.append(line)

    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def extract_pdf_text(data: bytes) -> tuple[str, int]:
    reader = PdfReader(io.BytesIO(data))
    pages: list[str] = []

    for page in reader.pages:
        page_text = page.extract_text() or ""
        page_text = normalize_text(page_text)

        if page_text:
            pages.append(page_text)

    text = "\n\n".join(pages)
    return normalize_text(text), len(reader.pages)


def extract_html_text(data: bytes) -> tuple[str, int]:
    # Passing bytes allows BeautifulSoup to inspect the page encoding itself,
    # which is important for French accents and other non-ASCII text.
    soup = BeautifulSoup(data, "html.parser")

    for tag in soup(
        [
            "script",
            "style",
            "noscript",
            "svg",
            "canvas",
            "iframe",
        ]
    ):
        tag.decompose()

    # Prefer the main/article content when a site exposes it.
    container = (
        soup.find("main")
        or soup.find("article")
        or soup.find(id="mw-content-text")  # MediaWiki / Wikisource
        or soup.body
        or soup
    )

    text = container.get_text("\n", strip=True)
    return normalize_text(text), 1


def extract_text(
    url: str,
    content_type: str,
    data: bytes,
) -> tuple[str, int, str]:
    if looks_like_pdf(url, content_type, data):
        text, page_count = extract_pdf_text(data)
        return text, page_count, "pdf"

    text, page_count = extract_html_text(data)
    return text, page_count, "html"


def word_count(text: str) -> int:
    return len(re.findall(r"\S+", text))


def download_inventory(figure_key: str, force: bool = False) -> None:
    rows = read_inventory(figure_key)
    destination = output_dir(figure_key)
    destination.mkdir(parents=True, exist_ok=True)

    downloaded = 0
    skipped = 0
    failed = 0

    print(f"Figure:    {figure_key}")
    print(f"Inventory: {inventory_path(figure_key)}")
    print(f"Output:    {destination}")
    print(f"Sources:   {len(rows)}")
    print()

    for index, row in enumerate(rows, start=1):
        source_key = (row.get("source_key") or "").strip()
        url = (row.get("original_url") or "").strip()
        local_filename = (row.get("local_filename") or "").strip()

        label = source_key or local_filename or f"source_{index}"

        if not url:
            print(f"[{index}/{len(rows)}] SKIP {label}: missing original_url")
            skipped += 1
            continue

        if not local_filename:
            print(f"[{index}/{len(rows)}] FAIL {label}: missing local_filename")
            failed += 1
            continue

        target = destination / local_filename

        if target.exists() and not force:
            print(
                f"[{index}/{len(rows)}] SKIP {label}: "
                f"{target.name} already exists"
            )
            skipped += 1
            continue

        print(f"[{index}/{len(rows)}] DOWNLOAD {label}")
        print(f"    {url}")

        try:
            data, content_type = fetch_url(url)
            text, pages, detected_type = extract_text(url, content_type, data)

            if len(text) < MIN_TEXT_CHARS:
                raise ValueError(
                    f"Extracted text is too short: {len(text):,} characters "
                    f"(minimum {MIN_TEXT_CHARS:,})"
                )

            # Always write UTF-8 so French characters such as é, è, à, ç, œ,
            # etc. are preserved correctly.
            target.write_text(text, encoding="utf-8")

            downloaded += 1

            print(
                f"    saved {target.name} | "
                f"type={detected_type} | "
                f"pages={pages:,} | "
                f"words={word_count(text):,} | "
                f"chars={len(text):,}"
            )

        except Exception as exc:
            failed += 1
            print(f"    FAILED: {exc}")

        # Be polite to source sites and reduce the chance of rate limiting.
        if index < len(rows):
            time.sleep(SOURCE_DELAY_SECONDS)

    print()
    print("Download summary")
    print(f"  downloaded: {downloaded}")
    print(f"  skipped:    {skipped}")
    print(f"  failed:     {failed}")

    if failed:
        raise SystemExit(1)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Download and extract web sources listed in a RecChat figure "
            "source inventory."
        )
    )
    parser.add_argument(
        "figure_key",
        help=(
            "Figure inventory key, e.g. nasa, noaa, mahavira, "
            "franklin, curie"
        ),
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Re-download and overwrite files that already exist.",
    )

    args = parser.parse_args()
    download_inventory(args.figure_key, force=args.force)


if __name__ == "__main__":
    main()
