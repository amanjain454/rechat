"use client";

import { BRAND } from "@/lib/brand";

export default function AppHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-stone-300 bg-[#f7f3eb]/95 px-4 py-3 backdrop-blur sm:px-8 sm:py-4">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-3">
          <p className="font-serif text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">
            {BRAND.productName}
          </p>

          <span className="shrink-0 rounded-full border border-[#c8c9ae] bg-[#e9eadc] px-2.5 py-1.5 text-[10px] font-semibold text-[#53583d] sm:px-3 sm:text-xs">
            {BRAND.trustCue}
          </span>
        </div>

        <p className="mt-1 text-xs leading-5 text-stone-600 sm:text-sm">
          {BRAND.tagline}
        </p>
      </div>
    </header>
  );
}
