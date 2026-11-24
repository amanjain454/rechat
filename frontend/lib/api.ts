import { API_BASE_URL, MATCH_COUNT } from "@/lib/config";
import { AnswerResponse, FiguresResponse } from "@/lib/types";

export async function fetchFigures(): Promise<FiguresResponse> {
  // Load all active figures from the backend.
  const response = await fetch(`${API_BASE_URL}/figures`);

  if (!response.ok) {
    throw new Error(`Unable to load figures: ${response.status}`);
  }

  const data: FiguresResponse = await response.json();

  if (data.figures.length === 0) {
    throw new Error("No active historical figures are available.");
  }

  return data;
}

export async function fetchAnswer(
  question: string,
  figureSlug: string,
): Promise<AnswerResponse> {
  // Send a grounded chat request for the selected historical figure.
  const response = await fetch(`${API_BASE_URL}/chat/answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question,
      figure_slug: figureSlug,
      match_count: MATCH_COUNT,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);
    const detail =
      errorData?.detail ?? `Request failed with status ${response.status}.`;

    throw new Error(detail);
  }

  return response.json();
}