import { FormEvent } from "react";

import { Figure } from "@/lib/types";


type Props = {
  question: string;
  selectedFigure: Figure | null;
  isLoading: boolean;
  onQuestionChange: (question: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};


export default function ChatComposer({
  question,
  selectedFigure,
  isLoading,
  onQuestionChange,
  onSubmit,
}: Props) {
  // Render the persistent chat input and submit button.
  return (
    <form
      onSubmit={onSubmit}
      className="sticky bottom-0 border-t border-stone-300 bg-[#f3efe6] px-5 py-4 sm:px-8"
    >

      <div className="mx-auto flex max-w-3xl items-end gap-3 rounded-2xl border border-stone-300 bg-white p-3 shadow-lg">

        <textarea
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          rows={2}
          disabled={isLoading || !selectedFigure}
          placeholder={
            selectedFigure
              ? `Ask ${selectedFigure.display_name} a question...`
              : "Choose a historical figure to begin..."
          }
          className="min-h-14 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-6 outline-none placeholder:text-stone-400 disabled:cursor-not-allowed sm:text-base"
        />

        <button
          type="submit"
          disabled={isLoading || !selectedFigure || !question.trim()}
          className="rounded-xl bg-[#4f5339] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#3f422e] disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {isLoading ? "Thinking…" : "Send"}
        </button>

      </div>

      <p className="mt-2 text-center text-xs text-stone-500">
        AI-generated interpretation based on retrieved sources. Review the
        evidence for important claims.
      </p>

    </form>
  );
}