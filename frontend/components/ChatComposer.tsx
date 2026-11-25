"use client";

import { KeyboardEvent } from "react";

import { BRAND } from "@/lib/brand";

type Props = {
  question: string;
  displayFigureName: string;
  isLoading: boolean;
  isDisabled: boolean;
  onQuestionChange: (value: string) => void;
  onSubmit: () => void;
};

export default function ChatComposer({
  question,
  displayFigureName,
  isLoading,
  isDisabled,
  onQuestionChange,
  onSubmit,
}: Props) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="sticky bottom-0 z-30 border-t border-stone-300 bg-[#f3efe6]/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:px-8 sm:py-4">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-end gap-2 rounded-2xl border border-stone-300 bg-white p-2.5 shadow-[0_-2px_18px_rgba(0,0,0,0.06)] sm:gap-3 sm:p-3">
          <textarea
            value={question}
            onChange={(event) => onQuestionChange(event.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            disabled={isDisabled || isLoading}
            placeholder={
              isDisabled
                ? BRAND.composerDisabledPlaceholder
                : BRAND.composerPlaceholder(displayFigureName)
            }
            className="min-h-12 max-h-36 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-6 text-stone-900 outline-none placeholder:text-stone-400 disabled:cursor-not-allowed disabled:text-stone-400 sm:text-base"
          />

          <button
            type="button"
            onClick={onSubmit}
            disabled={isDisabled || isLoading || !question.trim()}
            className="shrink-0 rounded-xl bg-[#4f5339] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#3f422e] disabled:cursor-not-allowed disabled:bg-stone-300 sm:px-5"
          >
            {isLoading ? "Thinking…" : "Send"}
          </button>
        </div>

        <p className="mt-2 text-center text-[11px] leading-4 text-stone-500 sm:text-xs">
          {BRAND.composerHelper}
        </p>
      </div>
    </div>
  );
}
