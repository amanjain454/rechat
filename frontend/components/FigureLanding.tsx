"use client";

import { useEffect, useState } from "react";

import { BRAND } from "@/lib/brand";
import { Figure } from "@/lib/types";

type Props = {
  figures: Figure[];
  selectedFigure: Figure | null;
  selectedFigureSlug: string;
  displayFigureName: string;
  suggestedQuestions: string[];
  isFiguresLoading: boolean;
  isLoading: boolean;
  onChangeFigure: (figureSlug: string) => void;
  onSelectSuggestedQuestion: (question: string) => void;
};

const ORGANIZATION_SLUGS = new Set(["nasa", "noaa", "nist"]);

const FIGURE_IMAGES: Record<string, string> = {
  "mahatma-gandhi": "/figures/mahatma-gandhi.jpg",
  "albert-einstein": "/figures/albert-einstein.jpg",
  "marie-curie": "/figures/marie-curie.jpg",
  "jane-austen": "/figures/jane-austen.jpg",
  "abraham-lincoln": "/figures/abraham-lincoln.jpg",
  "lord-mahavira": "/figures/lord-mahavira.jpg",
  "cory-doctorow": "/figures/cory-doctorow.jpg",
  nasa: "/figures/nasa.png",
  noaa: "/figures/noaa.png",
  nist: "/figures/nist.png",
};

function isOrganization(slug: string) {
  return ORGANIZATION_SLUGS.has(slug);
}

function getFigureImage(figure: Figure) {
  return FIGURE_IMAGES[figure.slug] ?? `/figures/${figure.slug}.jpg`;
}

function getFigureInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function FigureLanding({
  figures,
  selectedFigure,
  selectedFigureSlug,
  displayFigureName,
  suggestedQuestions,
  isFiguresLoading,
  isLoading,
  onChangeFigure,
  onSelectSuggestedQuestion,
}: Props) {
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  useEffect(() => {
    if (selectedFigureSlug) {
      setIsPickerOpen(false);
    }
  }, [selectedFigureSlug]);

  function chooseFigure(figureSlug: string) {
    onChangeFigure(figureSlug);
    setIsPickerOpen(false);
  }

  function openPicker() {
    setIsPickerOpen(true);

    // The sticky selected card may be visible far down the conversation.
    // Bring the picker back into view when Change is tapped.
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  function renderImage(figure: Figure, compact = false) {
    const organization = isOrganization(figure.slug);
    const imageFailed = failedImages[figure.slug];

    return (
      <div
        className={[
          "relative h-full w-full overflow-hidden",
          organization ? "bg-[#f7f6f1]" : "bg-[#ded9c8]",
        ].join(" ")}
      >
        {imageFailed ? (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#e4dfcf] to-[#c9c2ab]">
            <span
              className={[
                "font-serif font-semibold text-stone-500/70",
                compact ? "text-2xl" : "text-3xl sm:text-4xl",
              ].join(" ")}
            >
              {getFigureInitials(figure.display_name)}
            </span>
          </div>
        ) : (
          <img
            src={getFigureImage(figure)}
            alt={
              organization
                ? `${figure.display_name} logo`
                : figure.display_name
            }
            loading="lazy"
            onError={() =>
              setFailedImages((current) => ({
                ...current,
                [figure.slug]: true,
              }))
            }
            className={[
              "h-full w-full transition duration-300",
              organization
                ? compact
                  ? "object-contain p-3"
                  : figure.slug === "nist"
                    ? "object-contain p-7 sm:p-9"
                    : "object-contain p-6 sm:p-8"
                : "object-cover object-top group-hover:scale-[1.02]",
            ].join(" ")}
          />
        )}
      </div>
    );
  }

  if (isFiguresLoading) {
    return (
      <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <div className="h-8 w-64 animate-pulse rounded-lg bg-stone-200" />
          <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-stone-200" />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="aspect-[4/5] animate-pulse rounded-2xl bg-stone-200"
            />
          ))}
        </div>
      </section>
    );
  }

  const showPicker = !selectedFigure || isPickerOpen;

  if (showPicker) {
    return (
      <section className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
        <div className="mb-5 sm:mb-7">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
            {BRAND.landingHeadline}
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600 sm:text-base">
            {BRAND.landingDescription}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
          {figures.map((figure) => {
            const isSelected = figure.slug === selectedFigureSlug;

            return (
              <button
                key={figure.slug}
                type="button"
                aria-pressed={isSelected}
                disabled={isLoading}
                onClick={() => chooseFigure(figure.slug)}
                className={[
                  "group relative aspect-[4/5] overflow-hidden rounded-2xl bg-white text-left",
                  "border transition duration-200 ease-out",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6f7252] focus-visible:ring-offset-2",
                  "disabled:cursor-not-allowed disabled:opacity-70",
                  isSelected
                    ? "border-[#6f7252] ring-2 ring-[#6f7252]/35"
                    : "border-stone-200 hover:-translate-y-0.5 hover:border-stone-300 hover:shadow-md",
                ].join(" ")}
              >
                <div className="h-[72%] border-b border-stone-200">
                  {renderImage(figure)}
                </div>

                <div className="flex h-[28%] min-h-0 flex-col justify-center px-3 py-2.5 sm:px-4">
                  <h2 className="truncate text-base font-semibold leading-tight text-stone-900 sm:text-lg">
                    {figure.display_name}
                  </h2>

                  <p className="mt-1 truncate text-[11px] leading-5 text-stone-500 sm:text-xs">
                    {figure.short_description || BRAND.cardFallbackDescription}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {selectedFigure && (
          <button
            type="button"
            onClick={() => setIsPickerOpen(false)}
            className="mt-5 text-sm font-medium text-[#62664a] underline-offset-4 hover:underline"
          >
            {BRAND.keepPerspectivePrefix} {displayFigureName}
          </button>
        )}
      </section>
    );
  }

  return (
    <>
      <section className="sticky top-0 z-30 w-full bg-[#f3efe6]/95 px-4 py-2 backdrop-blur sm:px-6 sm:py-3">
        <div className="mx-auto w-full max-w-6xl">
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <div className="flex min-h-[82px] items-stretch sm:min-h-[104px]">
              <div className="w-[76px] shrink-0 border-r border-stone-200 sm:w-[124px]">
                {renderImage(selectedFigure, true)}
              </div>

              <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2.5 sm:px-5 sm:py-3">
                <div className="min-w-0">
                  <p className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-[#74715f] sm:block sm:text-xs">
                    {BRAND.selectedPerspectiveLabel}
                  </p>

                  <h1 className="truncate font-serif text-xl font-semibold text-stone-900 sm:mt-1 sm:text-3xl">
                    {displayFigureName}
                  </h1>

                  <p className="mt-1 hidden truncate text-xs text-stone-500 sm:block sm:text-sm">
                    {selectedFigure.short_description ||
                      BRAND.cardFallbackDescription}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isLoading}
                  onClick={openPicker}
                  className="shrink-0 rounded-full border border-stone-300 bg-[#faf8f2] px-3 py-2 text-xs font-semibold text-stone-700 transition hover:border-[#777b55] hover:bg-[#f1f1e7] disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:text-sm"
                >
                  {BRAND.changePerspectiveLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {suggestedQuestions.length > 0 && (
        <section className="mx-auto w-full max-w-6xl px-4 pb-5 sm:px-6 sm:pb-8">
          <div className="grid gap-2 sm:grid-cols-2">
            {suggestedQuestions.map((suggestedQuestion) => (
              <button
                key={suggestedQuestion}
                type="button"
                disabled={isLoading}
                onClick={() =>
                  onSelectSuggestedQuestion(suggestedQuestion)
                }
                className="rounded-xl border border-stone-200 bg-[#faf8f2] px-4 py-3 text-left text-sm leading-5 text-stone-700 transition hover:border-[#a4a58a] hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6f7252] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {suggestedQuestion}
              </button>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
