import posthog from "posthog-js";
import { analyticsEnabled } from "./analytics-consent";

export type AnalyticsEvent =
  | "figures_loaded"
  | "figure_selected"
  | "conversation_started"
  | "question_submitted"
  | "answer_started"
  | "answer_completed"
  | "answer_failed"
  | "question_blocked"
  | "feedback_submitted"
  | "suggested_question_clicked"
  | "citation_clicked"
  | "evidence_panel_closed";

type AnalyticsProperties = Record<
  string,
  string | number | boolean | string[] | null | undefined
>;

export function trackEvent(
  event: AnalyticsEvent,
  properties: AnalyticsProperties = {},
): void {
  if (typeof window === "undefined" || !analyticsEnabled()) return;

  try {
    posthog.capture(event, properties);
  } catch {
    console.warn("Analytics event capture failed:", event);
  }
}

export function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
