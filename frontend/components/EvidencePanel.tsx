"use client";

import { useEffect, useMemo, useState } from "react";

import { BRAND } from "@/lib/brand";
import { AnswerSource } from "@/lib/types";

type Props = {
  selectedSource: AnswerSource | null;
  visibleSources: AnswerSource[];
  onSelectSource: (source: AnswerSource) => void;
  onClose?: () => void;
  query?: string;
};

const STOP_WORDS = new Set([
  "the",
  "and",
  "that",
  "this",
  "with",
  "from",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "how",
  "does",
  "did",
  "have",
  "has",
  "was",
  "were",
  "are",
  "for",
  "into",
  "about",
  "your",
  "their",
  "its",
  "les",
  "des",
  "une",
  "dans",
  "avec",
  "pour",
  "que",
  "qui",
  "est",
  "sur",
]);

function getSourceTitle(source: AnswerSource) {
  return source.metadata?.source_title ?? "Source passage";
}

function getSourceTypeLabel(source: AnswerSource) {
  const raw = source.metadata?.source_type;

  if (!raw) {
    return "Source";
  }

  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function tokenize(text: string) {
  return (
    text
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter(
        (token) => token.length > 2 && !STOP_WORDS.has(token),
      ) ?? []
  );
}

function splitSentences(text: string) {
  const sentences =
    text
      .replace(/\s+/g, " ")
      .trim()
      .match(/[^.!?。！？]+[.!?。！？]+|[^.!?。！？]+$/g) ?? [];

  return sentences.map((sentence) => sentence.trim()).filter(Boolean);
}

function getRelevantExcerpt(
  content: string,
  query?: string,
  maxChars = 720,
) {
  const cleanContent = content.replace(/\s+/g, " ").trim();

  if (!cleanContent) {
    return "";
  }

  const sentences = splitSentences(cleanContent);

  if (!query || sentences.length === 0) {
    return cleanContent.length <= maxChars
      ? cleanContent
      : `${cleanContent.slice(0, maxChars).trimEnd()}…`;
  }

  const queryTokens = new Set(tokenize(query));

  if (queryTokens.size === 0) {
    return cleanContent.length <= maxChars
      ? cleanContent
      : `${cleanContent.slice(0, maxChars).trimEnd()}…`;
  }

  const scores = sentences.map((sentence) => {
    const sentenceTokens = new Set(tokenize(sentence));
    let score = 0;

    queryTokens.forEach((token) => {
      if (sentenceTokens.has(token)) {
        score += 1;
      }
    });

    return score;
  });

  let bestIndex = 0;

  for (let index = 1; index < scores.length; index += 1) {
    if (scores[index] > scores[bestIndex]) {
      bestIndex = index;
    }
  }

  if (scores[bestIndex] === 0) {
    return cleanContent.length <= maxChars
      ? cleanContent
      : `${cleanContent.slice(0, maxChars).trimEnd()}…`;
  }

  let start = bestIndex;
  let end = bestIndex;
  let excerpt = sentences[bestIndex];

  while (true) {
    const leftCandidate =
      start > 0 ? `${sentences[start - 1]} ${excerpt}` : null;
    const rightCandidate =
      end < sentences.length - 1
        ? `${excerpt} ${sentences[end + 1]}`
        : null;

    const canAddLeft =
      leftCandidate !== null && leftCandidate.length <= maxChars;
    const canAddRight =
      rightCandidate !== null && rightCandidate.length <= maxChars;

    if (!canAddLeft && !canAddRight) {
      break;
    }

    if (canAddLeft && canAddRight) {
      const leftScore = scores[start - 1] ?? 0;
      const rightScore = scores[end + 1] ?? 0;

      if (rightScore > leftScore) {
        end += 1;
        excerpt = rightCandidate!;
      } else {
        start -= 1;
        excerpt = leftCandidate!;
      }
    } else if (canAddLeft) {
      start -= 1;
      excerpt = leftCandidate!;
    } else if (canAddRight) {
      end += 1;
      excerpt = rightCandidate!;
    }
  }

  return excerpt;
}

export default function EvidencePanel({
  selectedSource,
  visibleSources: _visibleSources,
  onSelectSource: _onSelectSource,
  onClose,
  query,
}: Props) {
  const [isFullPassageOpen, setIsFullPassageOpen] =
    useState(false);

  useEffect(() => {
    setIsFullPassageOpen(false);
  }, [selectedSource?.chunk_key]);

  useEffect(() => {
    if (!selectedSource) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedSource]);

  const excerpt = useMemo(
    () =>
      selectedSource
        ? getRelevantExcerpt(selectedSource.content, query)
        : "",
    [selectedSource, query],
  );

  // Preserve the existing prop contract while this panel becomes
  // source-on-demand rather than a retrieved-source browser.
  void _visibleSources;
  void _onSelectSource;

  if (!selectedSource) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close evidence"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[1px]"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${BRAND.evidenceDrawerLabel} ${selectedSource.source_number}`}
        className={[
          "fixed z-50 bg-[#faf8f2] shadow-2xl",
          "inset-x-0 bottom-0 max-h-[72dvh] rounded-t-[28px] border border-stone-300",
          "lg:inset-y-0 lg:left-auto lg:right-0 lg:h-dvh lg:max-h-none lg:w-[460px]",
          "lg:rounded-none lg:rounded-l-[28px]",
        ].join(" ")}
      >
        <div className="flex h-full max-h-[72dvh] flex-col lg:max-h-none">
          <div className="shrink-0 border-b border-stone-200 px-5 pb-4 pt-3 sm:px-6 lg:pt-5">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-stone-300 lg:hidden" />

            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                  {BRAND.evidenceDrawerLabel} · [{selectedSource.source_number}]
                </p>

                <h2 className="mt-1.5 line-clamp-2 font-serif text-xl leading-tight text-stone-900 sm:text-2xl">
                  {getSourceTitle(selectedSource)}
                </h2>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-lg text-stone-600 transition hover:bg-stone-100"
                aria-label="Close source"
              >
                ×
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-[#e6e8d7] px-2.5 py-1 text-xs font-semibold text-[#565a3d]">
                {getSourceTypeLabel(selectedSource)}
              </span>

              {selectedSource.metadata?.publication_date && (
                <span className="rounded-full border border-stone-300 bg-white px-2.5 py-1 text-xs text-stone-500">
                  {selectedSource.metadata.publication_date}
                </span>
              )}
            </div>

            {selectedSource.metadata?.author && (
              <p className="mt-3 text-sm text-stone-500">
                {selectedSource.metadata.author}
              </p>
            )}

            <section className="mt-5 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                {BRAND.relevantExcerptLabel}
              </p>

              <p className="font-serif text-base leading-7 text-stone-800 sm:text-[1.05rem] sm:leading-8">
                {excerpt}
              </p>
            </section>

            <button
              type="button"
              onClick={() =>
                setIsFullPassageOpen((current) => !current)
              }
              className="mt-4 text-sm font-semibold text-[#5e6244] underline-offset-4 hover:underline"
            >
              {isFullPassageOpen
                ? BRAND.hideFullPassageLabel
                : BRAND.viewFullPassageLabel}
            </button>

            {isFullPassageOpen && (
              <section className="mt-3 rounded-2xl border border-stone-200 bg-[#f5f1e8] p-4 sm:p-5">
                <p className="whitespace-pre-wrap font-serif text-sm leading-7 text-stone-700 sm:text-base">
                  {selectedSource.content}
                </p>
              </section>
            )}

            <details className="mt-5 rounded-xl border border-stone-200 bg-white">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-stone-600">
                {BRAND.technicalDetailsLabel}
              </summary>

              <div className="space-y-2 border-t border-stone-200 px-4 py-4 text-xs text-stone-500">
                <p>
                  Similarity: {selectedSource.similarity.toFixed(4)}
                </p>
                <p>Chunk index: {selectedSource.chunk_index}</p>
                <p className="break-all">
                  Chunk key: {selectedSource.chunk_key}
                </p>
              </div>
            </details>
          </div>
        </div>
      </aside>
    </>
  );
}
