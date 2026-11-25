"use client";

import { ReactNode } from "react";

import { AnswerSource } from "@/lib/types";

type Props = {
  text: string;
  sources: AnswerSource[];
  onSelectSource: (source: AnswerSource) => void;
};

export default function CitationText({
  text,
  sources,
  onSelectSource,
}: Props) {
  const citationPattern = /\[(\d+)\]/g;
  const parts: ReactNode[] = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = citationPattern.exec(text)) !== null) {
    const citationStart = match.index;
    const citationEnd = citationStart + match[0].length;

    if (citationStart > lastIndex) {
      parts.push(text.slice(lastIndex, citationStart));
    }

    const sourceNumber = Number(match[1]);
    const source = sources.find(
      (item) => item.source_number === sourceNumber,
    );

    if (source) {
      parts.push(
        <button
          key={`${citationStart}-${sourceNumber}`}
          type="button"
          onClick={() => onSelectSource(source)}
          className="mx-0.5 inline-flex min-w-7 items-center justify-center rounded-md border border-[#c7c9a9] bg-[#ececdc] px-1.5 py-0.5 align-baseline text-xs font-semibold text-[#565a3d] transition hover:bg-[#dfe1c9] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6f7252]"
          aria-label={`Open source ${sourceNumber}`}
        >
          [{sourceNumber}]
        </button>,
      );
    } else {
      parts.push(match[0]);
    }

    lastIndex = citationEnd;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}
