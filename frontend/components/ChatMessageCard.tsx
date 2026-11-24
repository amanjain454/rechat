import CitationText from "@/components/CitationText";
import { getFigureInitials, getSourceTitle } from "@/lib/figure";
import { AnswerSource, ChatMessage, Figure } from "@/lib/types";

type Props = {
  message: ChatMessage;
  selectedFigure: Figure | null;
  onSelectSource: (source: AnswerSource) => void;
};

export default function ChatMessageCard({
  message,
  selectedFigure,
  onSelectSource,
}: Props) {
  // Render either a user question or a grounded assistant response.
  const sources = message.sources ?? [];

  if (message.role === "user") {
    return (
      <article className="ml-auto max-w-xl rounded-2xl bg-[#39342f] px-5 py-3.5 text-stone-50 shadow-sm">
        <p className="mb-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-300">
          You
        </p>

        <p className="text-sm leading-6 sm:text-base">
          {message.content}
        </p>
      </article>
    );
  }

  return (
    <article className="max-w-3xl">
      <div className="rounded-2xl border border-stone-300 bg-[#fbfaf6] px-5 py-6 shadow-sm sm:px-7">

        <div className="mb-5 flex items-center gap-3">

          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-300 bg-[#e8e3d7] font-serif text-lg font-semibold text-stone-700">
            {selectedFigure
              ? getFigureInitials(selectedFigure.display_name)
              : "—"}
          </div>

          <div>
            <p className="text-sm font-semibold text-stone-900">
              {selectedFigure?.display_name ?? "Historical figure"}
            </p>

            <p className="text-xs text-stone-500">
              Generated from retrieved historical evidence
            </p>
          </div>

        </div>

        <div className="font-serif text-[1.02rem] text-stone-800">
          <CitationText
            answer={message.content}
            sources={sources}
            onCitationClick={onSelectSource}
          />
        </div>

        {sources.length > 0 && (
          <div className="mt-6 border-t border-stone-200 pt-4">

            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
              Evidence used
            </p>

            <div className="flex flex-wrap gap-2">
              {sources.map((source) => (
                <button
                  key={source.chunk_key}
                  type="button"
                  onClick={() => onSelectSource(source)}
                  className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-700 transition hover:border-[#777b55] hover:bg-[#f1f1e7]"
                >
                  [{source.source_number}] {getSourceTitle(source)}
                </button>
              ))}
            </div>

          </div>
        )}

      </div>
    </article>
  );
}