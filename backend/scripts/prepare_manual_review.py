import csv
import json
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[2]

EVALUATION_RESULTS_DIR = (
    PROJECT_ROOT
    / "data"
    / "evaluation"
    / "results"
)

REVIEW_OUTPUT_DIR = (
    PROJECT_ROOT
    / "data"
    / "evaluation"
    / "reviews"
)


def find_latest_evaluation_file() -> Path:
    """
    Find the most recently created RAG evaluation JSON file.
    """

    evaluation_files = sorted(
        EVALUATION_RESULTS_DIR.glob(
            "gandhi_rag_evaluation_*.json"
        ),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )

    if not evaluation_files:
        raise FileNotFoundError(
            "No Gandhi evaluation result files were found."
        )

    return evaluation_files[0]


def load_evaluation_results(
    evaluation_file: Path,
) -> list[dict[str, Any]]:
    """
    Load question-level results from an evaluation JSON file.
    """

    data = json.loads(
        evaluation_file.read_text(
            encoding="utf-8"
        )
    )

    results = data.get("results", [])

    if not isinstance(results, list):
        raise ValueError(
            "The evaluation file does not contain "
            "a valid results list."
        )

    return results


def format_retrieved_sources(
    sources: list[dict[str, Any]],
) -> str:
    """
    Create a compact source summary for manual review.
    """

    formatted_sources = []

    for source in sources:
        formatted_sources.append(
            (
                f"[{source['source_number']}] "
                f"{source['source_title']} | "
                f"{source['chunk_key']} | "
                f"similarity={source['similarity']:.4f}"
            )
        )

    return "\n".join(formatted_sources)


def format_source_passages(
    sources: list[dict[str, Any]],
) -> str:
    """
    Combine retrieved passages into one reviewable text field.
    """

    formatted_passages = []

    for source in sources:
        formatted_passages.append(
            (
                f"[{source['source_number']}] "
                f"{source['source_title']}\n"
                f"{source['content']}"
            )
        )

    return "\n\n---\n\n".join(
        formatted_passages
    )


def build_review_row(
    result: dict[str, Any],
) -> dict[str, Any]:
    """
    Convert one evaluation result into a manual-review row.
    """

    sources = result.get("sources", [])

    return {
        "id": result.get("id", ""),
        "question": result.get(
            "question",
            "",
        ),
        "expected_answer_type": result.get(
            "expected_answer_type",
            "",
        ),
        "expected_sources": ", ".join(
            result.get(
                "expected_sources",
                [],
            )
        ),
        "generated_answer": result.get(
            "generated_answer",
            "",
        ),
        "retrieved_sources": (
            format_retrieved_sources(sources)
        ),
        "source_passages": (
            format_source_passages(sources)
        ),

        # Manual evaluation fields.
        "retrieval_relevance_score": "",
        "source_coverage_score": "",
        "citation_correctness_score": "",
        "groundedness_score": "",
        "answer_quality_score": "",
        "insufficient_evidence_handled": "",
        "overall_pass": "",
        "failure_category": "",
        "review_notes": "",
    }


def main() -> None:
    """
    Create a CSV template for manually reviewing RAG results.
    """

    evaluation_file = (
        find_latest_evaluation_file()
    )

    results = load_evaluation_results(
        evaluation_file
    )

    review_rows = [
        build_review_row(result)
        for result in results
        if "error" not in result
    ]

    if not review_rows:
        raise ValueError(
            "No successful evaluation results "
            "were available for review."
        )

    REVIEW_OUTPUT_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    review_file = (
        REVIEW_OUTPUT_DIR
        / evaluation_file.name.replace(
            "gandhi_rag_evaluation_",
            "gandhi_rag_manual_review_",
        ).replace(
            ".json",
            ".csv",
        )
    )

    fieldnames = list(
        review_rows[0].keys()
    )

    with review_file.open(
        mode="w",
        encoding="utf-8-sig",
        newline="",
    ) as csv_file:
        writer = csv.DictWriter(
            csv_file,
            fieldnames=fieldnames,
        )

        writer.writeheader()
        writer.writerows(review_rows)

    print(
        f"Evaluation file: {evaluation_file}"
    )
    print(
        f"Questions prepared: {len(review_rows)}"
    )
    print(
        f"Manual review file: {review_file}"
    )


if __name__ == "__main__":
    main()