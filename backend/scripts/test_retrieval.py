from app.retrieval.service import retrieve_chunks


QUESTION = "What did Gandhi believe about non-violence?"
FIGURE_SLUG = "mahatma-gandhi"
MATCH_COUNT = 5


def main() -> None:
    matches = retrieve_chunks(
        question=QUESTION,
        figure_slug=FIGURE_SLUG,
        match_count=MATCH_COUNT,
    )

    print(f"Question: {QUESTION}")
    print(f"Matches returned: {len(matches)}")
    print()

    for rank, match in enumerate(matches, start=1):
        print(f"RESULT {rank}")
        print("-" * 60)
        print(f"Chunk: {match['chunk_key']}")
        print(
            f"Similarity: {match['similarity']:.4f}"
        )
        print(f"Tokens: {match['token_count']}")
        print()
        print(match["content"][:700])
        print()
        print("=" * 60)
        print()


if __name__ == "__main__":
    main()