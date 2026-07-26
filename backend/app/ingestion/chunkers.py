def split_long_paragraph(
    paragraph: str,
    max_chars: int,
) -> list[str]:
    """
    Split a paragraph that exceeds max_chars.

    The function prefers sentence boundaries. If one sentence is
    itself longer than max_chars, it falls back to word boundaries.
    """

    sentences = paragraph.replace("? ", "?\n").replace(
        "! ", "!\n"
    ).replace(". ", ".\n").splitlines()

    pieces: list[str] = []
    current_sentences: list[str] = []
    current_length = 0

    for sentence in sentences:
        sentence = sentence.strip()

        if not sentence:
            continue

        # Handle an unusually long sentence using word boundaries.
        if len(sentence) > max_chars:
            if current_sentences:
                pieces.append(" ".join(current_sentences))
                current_sentences = []
                current_length = 0

            words = sentence.split()
            current_words: list[str] = []
            word_length = 0

            for word in words:
                additional_length = len(word) + (
                    1 if current_words else 0
                )

                if current_words and (
                    word_length + additional_length > max_chars
                ):
                    pieces.append(" ".join(current_words))
                    current_words = []
                    word_length = 0

                current_words.append(word)
                word_length += len(word) + (
                    1 if len(current_words) > 1 else 0
                )

            if current_words:
                pieces.append(" ".join(current_words))

            continue

        additional_length = len(sentence) + (
            1 if current_sentences else 0
        )

        if current_sentences and (
            current_length + additional_length > max_chars
        ):
            pieces.append(" ".join(current_sentences))
            current_sentences = []
            current_length = 0

        current_sentences.append(sentence)
        current_length += additional_length

    if current_sentences:
        pieces.append(" ".join(current_sentences))

    return pieces


def chunk_text(
    text: str,
    max_chars: int = 2000,
    overlap_chars: int = 200,
) -> list[str]:
    """
    Split a document into paragraph-aware chunks.

    Long paragraphs are first split at sentence or word boundaries.
    Neighboring chunks overlap using complete trailing paragraphs
    where possible.
    """

    if max_chars <= 0:
        raise ValueError("max_chars must be greater than zero.")

    if overlap_chars < 0:
        raise ValueError("overlap_chars cannot be negative.")

    if overlap_chars >= max_chars:
        raise ValueError(
            "overlap_chars must be smaller than max_chars."
        )

    original_paragraphs = [
        paragraph.strip()
        for paragraph in text.split("\n\n")
        if paragraph.strip()
    ]

    # Split paragraphs that are larger than the configured chunk size.
    paragraphs: list[str] = []

    for paragraph in original_paragraphs:
        if len(paragraph) <= max_chars:
            paragraphs.append(paragraph)
        else:
            paragraphs.extend(
                split_long_paragraph(
                    paragraph=paragraph,
                    max_chars=max_chars,
                )
            )

    chunks: list[str] = []
    current_paragraphs: list[str] = []
    current_length = 0

    for paragraph in paragraphs:
        separator_length = 2 if current_paragraphs else 0
        proposed_length = (
            current_length + separator_length + len(paragraph)
        )

        if current_paragraphs and proposed_length > max_chars:
            chunks.append("\n\n".join(current_paragraphs))

            # Reuse complete trailing paragraphs until the requested
            # overlap size is approximately reached.
            overlap_paragraphs: list[str] = []
            overlap_length = 0

            for previous_paragraph in reversed(current_paragraphs):
                added_length = len(previous_paragraph)
                if overlap_paragraphs:
                    added_length += 2

                if (
                    overlap_paragraphs
                    and overlap_length + added_length > overlap_chars
                ):
                    break

                overlap_paragraphs.insert(0, previous_paragraph)
                overlap_length += added_length

                if overlap_length >= overlap_chars:
                    break

            current_paragraphs = overlap_paragraphs
            current_length = overlap_length

        separator_length = 2 if current_paragraphs else 0
        current_paragraphs.append(paragraph)
        current_length += separator_length + len(paragraph)

    if current_paragraphs:
        chunks.append("\n\n".join(current_paragraphs))

    return chunks