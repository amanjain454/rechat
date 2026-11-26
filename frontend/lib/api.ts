import { AnswerSource, Figure } from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
type FiguresResponse = { figures: Figure[] };
type AnswerResponse = { question: string; figure_slug: string; answer: string; model: string | null; sources: AnswerSource[] };
export type StreamStatus = "checking" | "searching" | "preparing";
export type AnswerType = "substantive" | "insufficient_evidence";
export type StreamFailureType = "network_error" | "timeout" | "http_error" | "backend_error" | "stream_error" | "incomplete_stream" | "unknown";
export class StreamFailure extends Error {
  constructor(message: string, public readonly errorType: StreamFailureType, public readonly httpStatus?: number) { super(message); this.name = "StreamFailure"; }
}
type StreamEvent =
  | { type: "meta"; response_id: string; request_id?: string | null }
  | { type: "status"; status: "searching" }
  | { type: "sources"; sources: AnswerSource[] }
  | { type: "delta"; text: string }
  | { type: "blocked"; message: string; categories: string[] }
  | { type: "done"; model: string | null; answer_type?: AnswerType | null }
  | { type: "error"; message: string };
type StreamAnswerHandlers = {
  onMeta?: (responseId: string) => void;
  onStatus?: (status: StreamStatus) => void;
  onSources?: (sources: AnswerSource[]) => void;
  onDelta?: (text: string) => void;
  onBlocked?: (message: string, categories: string[]) => void;
  onDone?: (model: string | null, answerType: AnswerType | null) => void;
};

async function getErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = await response.json();
    if (payload && typeof payload.detail === "string") return payload.detail;
  } catch { /* Fall back to the supplied message. */ }
  return fallback;
}
export async function fetchFigures(): Promise<FiguresResponse> {
  const response = await fetch("/api/figures");
  if (!response.ok) throw new Error(await getErrorMessage(response, "Unable to load available perspectives."));
  return response.json();
}
export async function warmBackend(): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/warmup`, { method: "GET", cache: "no-store" });
  if (!response.ok) throw new Error("Backend warmup failed.");
}
export async function fetchAnswer(question: string, figureSlug: string, matchCount = 5): Promise<AnswerResponse> {
  const response = await fetch(`${API_BASE_URL}/chat/answer`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, figure_slug: figureSlug, match_count: matchCount }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, "Unable to generate an answer."));
  return response.json();
}
export async function streamAnswer(question: string, figureSlug: string, handlers: StreamAnswerHandlers, matchCount = 5, requestId?: string): Promise<void> {
  handlers.onStatus?.("checking");
  let response: Response;
  try { response = await fetch(`${API_BASE_URL}/chat/answer/stream`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
    body: JSON.stringify({ question, figure_slug: figureSlug, match_count: matchCount, request_id: requestId }),
  }); } catch (error) {
    throw new StreamFailure("Unable to connect to the answer service.", error instanceof Error && error.name === "TimeoutError" ? "timeout" : "network_error");
  }
  if (!response.ok) throw new StreamFailure(await getErrorMessage(response, "Unable to generate an answer."), "http_error", response.status);
  if (!response.body) throw new StreamFailure("The streaming response did not include a body.", "incomplete_stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedMeta = false;
  let receivedDone = false;
  let receivedBlocked = false;
  let receivedText = false;
  function processLine(line: string) {
    if (!line.trim()) return;
    const event = JSON.parse(line) as StreamEvent;
    if (receivedDone) throw new Error("Unexpected event after stream completion.");
    switch (event.type) {
      case "meta":
        if (receivedMeta || !event.response_id) throw new Error("Invalid response metadata.");
        if (event.request_id != null && requestId && event.request_id !== requestId) throw new Error("Response request ID mismatch.");
        receivedMeta = true;
        handlers.onMeta?.(event.response_id);
        return;
      case "status": handlers.onStatus?.(event.status); return;
      case "sources": handlers.onStatus?.("preparing"); handlers.onSources?.(event.sources); return;
      case "delta":
        if (receivedBlocked) throw new Error("Unexpected answer after moderation block.");
        if (event.text.trim()) receivedText = true;
        handlers.onDelta?.(event.text);
        return;
      case "blocked":
        if (receivedBlocked || receivedText) throw new Error("Unexpected moderation block.");
        receivedBlocked = true;
        handlers.onBlocked?.(event.message, event.categories);
        return;
      case "done":
        if (!receivedMeta || (!receivedText && !receivedBlocked)) throw new StreamFailure("Incomplete answer stream.", "incomplete_stream");
        receivedDone = true;
        if (!receivedBlocked && event.answer_type !== "substantive" && event.answer_type !== "insufficient_evidence") throw new StreamFailure("Missing answer classification.", "stream_error");
        handlers.onDone?.(event.model, event.answer_type ?? null);
        return;
      case "error": throw new StreamFailure(event.message, "backend_error");
    }
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) processLine(line);
      if (done) break;
    }
    if (buffer.trim()) processLine(buffer);
    if (!receivedDone) throw new StreamFailure("The answer stream ended before completion.", "incomplete_stream");
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error instanceof StreamFailure ? error : new StreamFailure("Answer stream interrupted or invalid.", "stream_error");
  } finally {
    reader.releaseLock();
  }
}
export async function submitAnswerFeedback(responseId: string, figureSlug: string, question: string, answer: string, rating: 1 | -1): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/chat/feedback`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ response_id: responseId, figure_slug: figureSlug, question, answer, rating }),
  });
  if (!response.ok) throw new Error(await getErrorMessage(response, "Unable to save feedback."));
}
