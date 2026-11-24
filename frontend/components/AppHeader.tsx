import { Figure } from "@/lib/types";


type Props = {
  selectedFigure: Figure | null;
};


export default function AppHeader({ selectedFigure }: Props) {
  // Render the persistent rechat header and selected figure identity.
  return (
    <header className="border-b border-stone-300 bg-[#f7f3eb] px-5 py-4 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">

        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
            rechat
          </p>

          {selectedFigure && (
            <p className="mt-1 text-lg font-semibold text-stone-900">
              {selectedFigure.display_name}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="rounded-full border border-olive-700 bg-[#e9eadc] px-3 py-1 text-xs font-medium text-[#53583d]">
            Source-grounded simulation
          </span>

          <span className="text-xs text-stone-500">
            Historical sources
          </span>
        </div>

      </div>
    </header>
  );
}