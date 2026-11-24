import {
  formatEvidenceText,
  getSourceTitle,
  getSourceTypeLabel,
} from "@/lib/figure";
import { AnswerSource } from "@/lib/types";

type Props = {
  selectedSource: AnswerSource | null;
  visibleSources: AnswerSource[];
  onSelectSource: (source: AnswerSource) => void;
};

export default function EvidencePanel({
  selectedSource,
  visibleSources,
  onSelectSource,
}: Props) {
  // Render the selected evidence passage and alternative retrieved passages.
  return (
    <aside
      id="evidence-panel"
      className="min-w-0 bg-[#ebe5d9] px-4 py-6 lg:sticky lg:top-0 lg:h-[calc(100vh-81px)] lg:overflow-y-auto"
    >
      <div className="mb-4">
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-stone-500">
          Evidence panel
        </p>

        <h2 className="mt-1.5 font-serif text-xl text-stone-900">
          Source passage
        </h2>
      </div>

      {!selectedSource ? (
        <div className="rounded-xl border border-stone-300 bg-[#f8f5ee] p-4">
          <p className="text-sm leading-6 text-stone-600">
            Ask a question, then select a citation to inspect the passage used
            in the answer.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-stone-300 bg-[#faf8f2] p-4 shadow-sm">

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="inline-flex rounded-full bg-[#e4e6d4] px-2.5 py-1 text-[0.68rem] font-semibold text-[#565a3d]">
                  {getSourceTypeLabel(selectedSource)}
                </span>

                <h3 className="mt-3 font-serif text-xl leading-6 text-stone-900">
                  {getSourceTitle(selectedSource)}
                </h3>

                {selectedSource.metadata.author && (
                  <p className="mt-1 text-xs text-stone-500">
                    {selectedSource.metadata.author}
                  </p>
                )}
              </div>

              <span className="shrink-0 rounded-md border border-[#c8cbb2] bg-[#e7e8d8] px-2 py-1 text-xs font-semibold text-[#52563b]">
                [{selectedSource.source_number}]
              </span>
            </div>

            <div className="mt-4 border-t border-stone-200 pt-4">
              <p className="whitespace-pre-line font-serif text-[0.95rem] leading-7 text-stone-800">
                {formatEvidenceText(selectedSource.content)}
              </p>
            </div>

          </div>

          <details className="rounded-xl border border-stone-300 bg-[#f8f5ee]">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-stone-700">
              Technical details
            </summary>

            <div className="space-y-2 border-t border-stone-300 px-4 py-4 text-xs text-stone-600">
              <p>Similarity: {selectedSource.similarity.toFixed(4)}</p>
              <p>Chunk index: {selectedSource.chunk_index}</p>
              <p className="break-all">
                Chunk key: {selectedSource.chunk_key}
              </p>

              {selectedSource.metadata.publication_date && (
                <p>
                  Publication date: {selectedSource.metadata.publication_date}
                </p>
              )}
            </div>
          </details>

          {visibleSources.length > 1 && (
            <div>
              <p className="mb-3 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Other retrieved passages
              </p>

              <div className="space-y-2">
                {visibleSources.map((source) => (
                  <button
                    key={source.chunk_key}
                    type="button"
                    onClick={() => onSelectSource(source)}
                    className={
                      source.chunk_key === selectedSource.chunk_key
                        ? "w-full rounded-xl border border-[#767a55] bg-[#e4e5d3] p-3 text-left"
                        : "w-full rounded-xl border border-stone-300 bg-[#f8f5ee] p-3 text-left transition hover:border-[#767a55] hover:bg-white"
                    }
                  >
                    <p className="text-sm font-medium text-stone-800">
                      [{source.source_number}] {getSourceTitle(source)}
                    </p>

                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">
                      {formatEvidenceText(source.content)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}