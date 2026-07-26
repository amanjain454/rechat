import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.generation.service import (
    GENERATION_MODEL,
    generate_grounded_answer,
)


PROJECT_ROOT = Path(__file__).resolve().parents[2]

QUESTIONS_FILE = (
    PROJECT_ROOT
    / "data"
    / "evaluation"
    / "gandhi_questions.json"
)

OUTPUT_DIR = (
    PROJECT_ROOT
    / "data"
    / "evaluation"
    / "results"
)

FIGURE_SLUG = "mahatma-gandhi"
MATCH_COUNT = 5


def load_questions() -> list[dict[str, Any]]:
    """
    Load evaluation questions from gandhi_questions.json.

    Supported formats:

    1. A list of strings:
       [
         "What did Gandhi say about non-violence?"
       ]

    2. A list of objects:
       [
         {
           "id": "gandhi_001",
           "question": "What did Gandhi say about non-violence?"
         }
       ]

    3. An object containing a questions list:
       {
         "questions": [...]
       }
    """

    if not QUESTIONS_FILE.exists():
        raise FileNotFoundError(
            f"Evaluation file not found: {QUESTIONS_FILE}"
        )

    data = json.loads(
        QUESTIONS_FILE.read_text(encoding="utf-8")
    )

    if isinstance(data, dict):
        data = data.get("questions", [])

    if not isinstance(data, list):
        raise ValueError(
            "Evaluation file must contain a list of questions."
        )

    normalized_questions: list[dict[str, Any]] = []

    for index, item in enumerate(data, start=1):
        if isinstance(item, str):
            normalized_questions.append(
                {
                    "id": f"gandhi_{index:03d}",
                    "question": item.strip(),
                }
            )

        elif isinstance(item, dict):
            question_text = str(
                item.get("question", "")
            ).strip()

            normalized_questions.append(
                {
                    **item,
                    "id": item.get(
                        "id",
                        f"gandhi_{index:03d}",
                    ),
                    "question": question_text,
                }
            )

        else:
            raise ValueError(
                f"Unsupported question format at position {index}."
            )

    valid_questions = [
        item
        for item in normalized_questions
        if item["question"]
    ]

    if not valid_questions:
        raise ValueError(
            "No valid evaluation questions were found."
        )

    return valid_questions


def build_source_record(
    source_number: int,
    match: dict[str, Any],
) -> dict[str, Any]:
    """
    Convert one retrieved chunk into an evaluation result record.
    """

    metadata = match.get("metadata", {})

    return {
        "source_number": source_number,
        "source_title": metadata.get(
            "source_title",
            "Unknown source",
        ),
        "source_key": metadata.get(
            "source_key",
            "unknown",
        ),
        "chunk_key": match["chunk_key"],
        "chunk_index": match["chunk_index"],
        "similarity": match["similarity"],
        "token_count": match["token_count"],
        "content": match["content"],
        "metadata": metadata,
    }


def evaluate_question(
    question_record: dict[str, Any],
) -> dict[str, Any]:
    """
    Run one question through the full RAG pipeline.
    """

    question = question_record["question"]

    result = generate_grounded_answer(
        question=question,
        figure_slug=FIGURE_SLUG,
        match_count=MATCH_COUNT,
    )

    matches: list[dict[str, Any]] = result["matches"]

    sources = [
        build_source_record(
            source_number=source_number,
            match=match,
        )
        for source_number, match in enumerate(
            matches,
            start=1,
        )
    ]

    retrieved_source_titles = list(
        dict.fromkeys(
            source["source_title"]
            for source in sources
        )
    )

    return {
        "id": question_record["id"],
        "question": question,
        "expected_answer_type": question_record.get(
            "expected_answer_type"
        ),
        "expected_sources": question_record.get(
            "expected_sources",
            [],
        ),
        "generated_answer": result["answer"],
        "generation_model": result["model"],
        "match_count_requested": MATCH_COUNT,
        "match_count_returned": len(matches),
        "retrieved_source_titles": (
            retrieved_source_titles
        ),
        "sources": sources,
    }


def main() -> None:
    """
    Evaluate every Gandhi question and save the results to JSON.
    """

    questions = load_questions()

    print(f"Questions loaded: {len(questions)}")
    print(f"Figure: {FIGURE_SLUG}")
    print(f"Generation model: {GENERATION_MODEL}")
    print(f"Retrieved chunks per question: {MATCH_COUNT}")
    print()

    results: list[dict[str, Any]] = []

    for index, question_record in enumerate(
        questions,
        start=1,
    ):
        print(
            f"[{index}/{len(questions)}] "
            f"{question_record['question']}"
        )

        try:
            evaluation_result = evaluate_question(
                question_record
            )

            results.append(evaluation_result)

            source_titles = (
                evaluation_result[
                    "retrieved_source_titles"
                ]
            )

            print(
                "Sources: "
                + ", ".join(source_titles)
            )
            print("Status: completed")

        except Exception as exc:
            results.append(
                {
                    "id": question_record["id"],
                    "question": (
                        question_record["question"]
                    ),
                    "error": str(exc),
                }
            )

            print(f"Status: failed — {exc}")

        print()

    timestamp = datetime.now(
        timezone.utc
    ).strftime("%Y%m%dT%H%M%SZ")

    output_file = (
        OUTPUT_DIR
        / f"gandhi_rag_evaluation_{timestamp}.json"
    )

    OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    evaluation_report = {
        "evaluation_metadata": {
            "created_at_utc": timestamp,
            "figure_slug": FIGURE_SLUG,
            "generation_model": GENERATION_MODEL,
            "match_count": MATCH_COUNT,
            "question_count": len(questions),
        },
        "results": results,
    }

    output_file.write_text(
        json.dumps(
            evaluation_report,
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )

    successful_count = sum(
        1
        for result in results
        if "error" not in result
    )

    failed_count = (
        len(results) - successful_count
    )

    print("=" * 70)
    print(f"Successful evaluations: {successful_count}")
    print(f"Failed evaluations: {failed_count}")
    print(f"Output: {output_file}")


if __name__ == "__main__":
    main()