import {
  AnswerSource,
  Figure,
} from "@/lib/types";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000";

type FiguresResponse = {
  figures: Figure[];
};

type AnswerResponse = {
  question: string;
  figure_slug: string;
  answer: string;
  model: string | null;
  sources: AnswerSource[];
};

type StreamEvent =
  | {
      type: "sources";
      sources: AnswerSource[];
    }
  | {
      type: "delta";
      text: string;
    }
  | {
      type: "done";
      model: string | null;
    }
  | {
      type: "error";
      message: string;
    };

type StreamAnswerHandlers = {
  onSources?: (sources: AnswerSource[]) => void;
  onDelta?: (text: string) => void;
  onDone?: (model: string | null) => void;
};

async function getErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const payload = await response.json();

    if (
      payload &&
      typeof payload.detail === "string"
    ) {
      return payload.detail;
    }
  } catch {
    // Fall back to the supplied message.
  }

  return fallback;
}

export async function fetchFigures(): Promise<FiguresResponse> {
  // Read figure metadata through Next.js instead of directly from Render.
  // The server route caches this slowly-changing data at Vercel, so the
  // landing page does not need to wait for a sleeping Render backend.
  const response = await fetch("/api/figures");

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        "Unable to load available perspectives.",
      ),
    );
  }

  return response.json();
}

export async function warmBackend(): Promise<void> {
  // Fire-and-forget from the landing page. On Render Free this request wakes
  // the sleeping service; once running, /warmup primes Supabase, figure IDs,
  // and the shared OpenAI connection before the user asks a question.
  const response = await fetch(
    `${API_BASE_URL}/warmup`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error("Backend warmup failed.");
  }
}

export async function fetchAnswer(
  question: string,
  figureSlug: string,
  matchCount = 5,
): Promise<AnswerResponse> {
  const response = await fetch(
    `${API_BASE_URL}/chat/answer`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question,
        figure_slug: figureSlug,
        match_count: matchCount,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        "Unable to generate an answer.",
      ),
    );
  }

  return response.json();
}

export async function streamAnswer(
  question: string,
  figureSlug: string,
  handlers: StreamAnswerHandlers,
  matchCount = 5,
): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/chat/answer/stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
      },
      body: JSON.stringify({
        question,
        figure_slug: figureSlug,
        match_count: matchCount,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        "Unable to generate an answer.",
      ),
    );
  }

  if (!response.body) {
    throw new Error(
      "The streaming response did not include a body.",
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  function processLine(line: string) {
    if (!line.trim()) {
      return;
    }

    const event = JSON.parse(line) as StreamEvent;

    if (event.type === "sources") {
      handlers.onSources?.(event.sources);
      return;
    }

    if (event.type === "delta") {
      handlers.onDelta?.(event.text);
      return;
    }

    if (event.type === "done") {
      handlers.onDone?.(event.model);
      return;
    }

    if (event.type === "error") {
      throw new Error(event.message);
    }
  }

  while (true) {
    const { value, done } = await reader.read();

    buffer += decoder.decode(
      value,
      { stream: !done },
    );

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      processLine(line);
    }

    if (done) {
      break;
    }
  }

  if (buffer.trim()) {
    processLine(buffer);
  }
}
