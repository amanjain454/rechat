from app.retrieval.service import retrieve_chunks


QUESTION = "What were Gandhi's thoughts about World War 1?"
FIGURE_SLUG = "mahatma-gandhi"
MATCH_COUNT = 5


def main() -> None:
    """
    Retrieve and display the top matching Gandhi source chunks.
    """

    matches = retrieve_chunks(
        question=QUESTION,
        figure_slug=FIGURE_SLUG,
        match_count=MATCH_COUNT,
    )

    print(f"Question: {QUESTION}")
    print(f"Matches returned: {len(matches)}")
    print()

    for rank, match in enumerate(matches, start=1):
        metadata = match.get("metadata", {})

        source_title = metadata.get(
            "source_title",
            "Unknown source",
        )

        source_key = metadata.get(
            "source_key",
            "Unknown source key",
        )

        print(f"RESULT {rank}")
        print("-" * 70)
        print(f"Source: {source_title}")
        print(f"Source key: {source_key}")
        print(f"Chunk: {match['chunk_key']}")
        print(f"Chunk index: {match['chunk_index']}")
        print(f"Similarity: {match['similarity']:.4f}")
        print(f"Tokens: {match['token_count']}")
        print()
        print("PASSAGE")
        print("-" * 70)
        print(match["content"][:1000])
        print()
        print("=" * 70)
        print()


if __name__ == "__main__":
    main()