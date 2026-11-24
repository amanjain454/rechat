import ReactMarkdown from "react-markdown";

import { AnswerSource } from "@/lib/types";

type Props = {
  answer: string;
  sources: AnswerSource[];
  onCitationClick: (source: AnswerSource) => void;
};

export default function CitationText({
  answer,
  sources,
  onCitationClick,
}: Props) {
  // Render Markdown while converting numbered citations into evidence buttons.
  const markdown = answer.replace(/\[(\d+)\]/g, "[$1](#citation-$1)");

  return (
    <div className="space-y-4">
      <ReactMarkdown
        components={{
          p: ({ children }) => (
            <p className="leading-7 text-stone-800">{children}</p>
          ),

          strong: ({ children }) => (
            <strong className="font-semibold text-stone-950">
              {children}
            </strong>
          ),

          ul: ({ children }) => (
            <ul className="list-disc space-y-2 pl-6">{children}</ul>
          ),

          ol: ({ children }) => (
            <ol className="list-decimal space-y-2 pl-6">{children}</ol>
          ),

          li: ({ children }) => (
            <li className="pl-1 leading-7 text-stone-800">{children}</li>
          ),

          a: ({ href, children }) => {
            if (href?.startsWith("#citation-")) {
              const sourceNumber = Number(
                href.replace("#citation-", ""),
              );

              const source = sources.find(
                (item) => item.source_number === sourceNumber,
              );

              if (!source) return <>{children}</>;

              return (
                <button
                  type="button"
                  onClick={() => onCitationClick(source)}
                  className="mx-0.5 inline-flex min-w-6 items-center justify-center rounded-md border border-[#c8cbb2] bg-[#e7e8d8] px-1.5 py-0.5 align-baseline text-xs font-semibold text-[#52563b] transition hover:border-[#777b55] hover:bg-[#d9dbc2] focus:outline-none focus:ring-2 focus:ring-[#777b55]"
                  aria-label={`Open source ${sourceNumber}`}
                >
                  [{sourceNumber}]
                </button>
              );
            }

            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-stone-400 underline-offset-2"
              >
                {children}
              </a>
            );
          },
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}