"use client";

import CitationText from "@/components/CitationText";
import { BRAND } from "@/lib/brand";
import {
  AnswerSource,
  ChatMessage,
  Figure,
} from "@/lib/types";
import { StreamStatus } from "@/lib/api";

type Props = {
  message: ChatMessage;
  selectedFigure: Figure | null;
  onSelectSource: (source: AnswerSource) => void;
  isStreaming?: boolean;
  loadingStage?: StreamStatus | null;
  isBlocked?: boolean;
  feedbackRating?: 1 | -1 | null;
  feedbackPending?: boolean;
  feedbackError?: boolean;
  onFeedback?: (rating: 1 | -1) => void;
};

function getFigureInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function getSourceTitle(source: AnswerSource) {
  return source.metadata?.source_title ?? "Source passage";
}

function getCitedSources(
  answer: string,
  sources: AnswerSource[],
): AnswerSource[] {
  const citationPattern = /\[(\d+)\]/g;
  const sourceMap = new Map(
    sources.map(
      (source) => [
        source.source_number,
        source,
      ],
    ),
  );

  const seen = new Set<number>();
  const cited: AnswerSource[] = [];

  let match: RegExpExecArray | null;

  while (
    (match = citationPattern.exec(answer)) !== null
  ) {
    const sourceNumber = Number(match[1]);

    if (seen.has(sourceNumber)) {
      continue;
    }

    const source = sourceMap.get(sourceNumber);

    if (source) {
      seen.add(sourceNumber);
      cited.push(source);
    }
  }

  return cited;
}

function getLoadingLabel(
  stage: StreamStatus | null | undefined,
) {
  if (stage === "checking") {
    return BRAND.loadingChecking;
  }

  if (stage === "preparing") {
    return BRAND.loadingPreparing;
  }

  return BRAND.loadingSearching;
}

function ThumbUpIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 10v10H3V10h4Z" />
      <path d="M7 19h10.3a2 2 0 0 0 1.95-1.56l1.3-6A2 2 0 0 0 18.6 9H14l.7-3.2A2.8 2.8 0 0 0 12 2.5L7 10v9Z" />
    </svg>
  );
}

function ThumbDownIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 14V4H3v10h4Z" />
      <path d="M7 5h10.3a2 2 0 0 1 1.95 1.56l1.3 6A2 2 0 0 1 18.6 15H14l.7 3.2A2.8 2.8 0 0 1 12 21.5L7 14V5Z" />
    </svg>
  );
}

export default function ChatMessageCard({
  message,
  selectedFigure,
  onSelectSource,
  isStreaming = false,
  loadingStage = null,
  isBlocked = false,
  feedbackRating = null,
  feedbackPending = false,
  feedbackError = false,
  onFeedback,
}: Props) {
  if (message.role === "user") {
    return (
      <article className="ml-auto w-fit max-w-[92%] rounded-2xl bg-stone-800 px-4 py-3.5 text-stone-50 shadow-sm sm:max-w-2xl sm:px-5 sm:py-4">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-300">
          You
        </p>

        <p className="text-sm leading-6 sm:text-base sm:leading-7">
          {message.content}
        </p>
      </article>
    );
  }

  const figureName =
    selectedFigure?.display_name ??
    BRAND.productName;
  const sources = message.sources ?? [];
  const citedSources = getCitedSources(
    message.content,
    sources,
  );

  const canShowFeedback =
    Boolean(message.content) &&
    !isStreaming &&
    !isBlocked &&
    Boolean(onFeedback);

  return (
    <article className="w-full max-w-3xl">
      <div className="rounded-2xl border border-stone-300 bg-[#fbfaf6] px-4 py-5 shadow-sm sm:px-7 sm:py-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-[#e8e3d7] font-serif text-lg font-semibold text-stone-700">
            {getFigureInitials(figureName)}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-stone-900">
                {figureName}
              </p>

              {isBlocked && (
                <span className="rounded-full border border-stone-300 bg-stone-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">
                  {BRAND.safetyLabel}
                </span>
              )}
            </div>

            <p className="text-xs text-stone-500">
              {isBlocked
                ? "Request handled safely"
                : BRAND.answerAttribution}
            </p>
          </div>
        </div>

        {message.content ? (
          <div className="whitespace-pre-wrap font-serif text-[1.02rem] leading-8 text-stone-800 sm:text-[1.05rem]">
            <CitationText
              text={message.content}
              sources={sources}
              onSelectSource={onSelectSource}
            />

            {isStreaming && (
              <span
                aria-hidden="true"
                className="ml-0.5 inline-block animate-pulse text-[#6b6f4c]"
              >
                ▍
              </span>
            )}
          </div>
        ) : isStreaming ? (
          <div
            className="flex items-center gap-3 py-1"
            role="status"
            aria-live="polite"
          >
            <div
              className="flex items-center gap-1"
              aria-hidden="true"
            >
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#6b6f4c]" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#6b6f4c] [animation-delay:180ms]" />
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#6b6f4c] [animation-delay:360ms]" />
            </div>

            <p className="text-sm text-stone-600">
              {getLoadingLabel(loadingStage)}
            </p>
          </div>
        ) : null}

        {citedSources.length > 0 && (
          <div className="mt-5 border-t border-stone-200 pt-4">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
              {BRAND.evidenceUsedLabel}
            </p>

            <div className="grid gap-2 sm:grid-cols-2">
              {citedSources.map((source) => (
                <button
                  key={source.chunk_key}
                  type="button"
                  onClick={() =>
                    onSelectSource(source)
                  }
                  className="flex min-w-0 items-center gap-2 rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-left transition hover:border-[#777b55] hover:bg-[#f1f1e7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6f7252]"
                >
                  <span className="shrink-0 rounded-md bg-[#ececdc] px-1.5 py-1 text-[11px] font-semibold text-[#565a3d]">
                    [{source.source_number}]
                  </span>

                  <span className="min-w-0 truncate text-xs font-medium text-stone-700">
                    {getSourceTitle(source)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {canShowFeedback && (
          <div className="mt-5 flex items-center gap-2 border-t border-stone-200 pt-4">
            <span className="mr-1 text-xs text-stone-500">
              {feedbackRating
                ? BRAND.feedbackSaved
                : BRAND.feedbackPrompt}
            </span>

            <button
              type="button"
              aria-label="Helpful"
              aria-pressed={feedbackRating === 1}
              disabled={feedbackPending}
              onClick={() => onFeedback?.(1)}
              className={[
                "rounded-full border p-2 transition",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6f7252]",
                "disabled:cursor-wait disabled:opacity-60",
                feedbackRating === 1
                  ? "border-[#7d815c] bg-[#e9eadc] text-[#4f5339]"
                  : "border-stone-300 bg-white text-stone-500 hover:border-[#8d9070] hover:text-[#565a3d]",
              ].join(" ")}
            >
              <ThumbUpIcon />
            </button>

            <button
              type="button"
              aria-label="Not helpful"
              aria-pressed={feedbackRating === -1}
              disabled={feedbackPending}
              onClick={() => onFeedback?.(-1)}
              className={[
                "rounded-full border p-2 transition",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6f7252]",
                "disabled:cursor-wait disabled:opacity-60",
                feedbackRating === -1
                  ? "border-stone-500 bg-stone-200 text-stone-800"
                  : "border-stone-300 bg-white text-stone-500 hover:border-stone-500 hover:text-stone-700",
              ].join(" ")}
            >
              <ThumbDownIcon />
            </button>

            {feedbackError && (
              <span className="ml-1 text-[11px] text-stone-500">
                Couldn’t save. Try again.
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
