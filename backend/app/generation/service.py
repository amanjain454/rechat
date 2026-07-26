from typing import Any

from openai import OpenAI

from app.retrieval.service import retrieve_chunks


GENERATION_MODEL = "gpt-5.6-luna"
DEFAULT_MATCH_COUNT = 5


GROUNDING_INSTRUCTIONS = """
You are the grounded answer-generation layer for RecChat.

Answer the user's question using only the supplied source passages.

Rules:
1. Do not use outside knowledge.
2. Do not invent quotations, events, beliefs, or historical details.
3. Cite supporting passages using [1], [2], and so on.
4. If the passages do not adequately answer the question, say:
   "The available sources do not provide enough evidence to answer this."
5. Explain Gandhi's views in clear modern English.
6. Do not pretend to literally be Gandhi.
7. Keep the answer concise unless the question requires detail.
""".strip()


def build_context(matches: list[dict[str, Any]]) -> str:
    """
    Convert retrieved chunks into numbered source passages.

    The numbering lets the model cite passages as [1], [2], etc.
    """

    passages = []

    for source_number, match in enumerate(matches, start=1):
        passage = (
            f"[{source_number}]\n"
            f"Chunk key: {match['chunk_key']}\n"
            f"Similarity: {match['similarity']:.4f}\n"
            f"Passage:\n{match['content']}"
        )

        passages.append(passage)

    return "\n\n---\n\n".join(passages)


def generate_grounded_answer(
    question: str,
    figure_slug: str,
    match_count: int = DEFAULT_MATCH_COUNT,
) -> dict[str, Any]:
    """
    Retrieve relevant chunks and generate a source-grounded answer.
    """

    cleaned_question = question.strip()

    if not cleaned_question:
        raise ValueError("Question cannot be empty.")

    # Retrieve relevant source passages before calling the chat model.
    matches = retrieve_chunks(
        question=cleaned_question,
        figure_slug=figure_slug,
        match_count=match_count,
    )

    if not matches:
        return {
            "answer": (
                "The available sources do not provide enough "
                "evidence to answer this."
            ),
            "model": None,
            "matches": [],
        }

    context = build_context(matches)

    # Keep the user's question separate from the retrieved evidence.
    model_input = f"""
Question:
{cleaned_question}

Source passages:
{context}

Write a grounded answer to the question. Cite the relevant source
passages using their bracketed numbers.
""".strip()

    client = OpenAI()

    response = client.responses.create(
        model=GENERATION_MODEL,
        reasoning={"effort": "low"},
        instructions=GROUNDING_INSTRUCTIONS,
        input=model_input,
    )

    answer = response.output_text.strip()

    if not answer:
        raise RuntimeError(
            "The generation model returned an empty answer."
        )

    return {
        "answer": answer,
        "model": GENERATION_MODEL,
        "matches": matches,
    }