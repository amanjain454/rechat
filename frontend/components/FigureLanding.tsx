"use client";

import { useState } from "react";

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

  // Keep logos as PNG so transparency stays intact.
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

function getLifeYears(figure: Figure) {
  if (!figure.birth_year && !figure.death_year) {
    return null;
  }

  return `${figure.birth_year ?? "?"} – ${figure.death_year ?? "?"}`;
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

  if (isFiguresLoading) {
    return (
      <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <div className="h-8 w-56 animate-pulse rounded-lg bg-stone-200" />
          <div className="mt-3 h-4 w-72 max-w-full animate-pulse rounded bg-stone-200" />
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

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 sm:mb-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#74715f]">
          RecChat
        </p>

        <h1 className="font-serif text-3xl font-semibold tracking-tight text-stone-900 sm:text-4xl">
          Choose a mind to explore
        </h1>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600 sm:text-base">
          Ask questions grounded in writings, speeches, interviews, and
          historical or institutional sources.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4">
        {figures.map((figure) => {
          const organization = isOrganization(figure.slug);
          const isSelected = figure.slug === selectedFigureSlug;
          const imageFailed = failedImages[figure.slug];
          const lifeYears = getLifeYears(figure);

          return (
            <button
              key={figure.slug}
              type="button"
              aria-pressed={isSelected}
              disabled={isLoading}
              onClick={() => onChangeFigure(figure.slug)}
              className={[
                "group relative aspect-[4/5] overflow-hidden rounded-2xl text-left",
                "transition duration-200 ease-out",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6f7252] focus-visible:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-70",
                isSelected
                  ? "ring-2 ring-[#6f7252] ring-offset-2"
                  : "ring-1 ring-black/5 hover:-translate-y-0.5 hover:shadow-lg",
                organization ? "bg-[#f7f6f1]" : "bg-[#ded9c8]",
              ].join(" ")}
            >
              {organization ? (
                <>
                  {/* Organization card: logo gets its own clean image area */}
                  <div className="absolute inset-x-0 top-0 h-[64%] bg-[#f7f6f1]">
                    <div className="flex h-full w-full items-center justify-center p-5 sm:p-7">
                      {!imageFailed ? (
                        <img
                          src={getFigureImage(figure)}
                          alt={`${figure.display_name} logo`}
                          loading="lazy"
                          onError={() =>
                            setFailedImages((current) => ({
                              ...current,
                              [figure.slug]: true,
                            }))
                          }
                          className={[
                            "h-full w-full object-contain transition duration-300",
                            "group-hover:scale-[1.025]",
                            figure.slug === "nist"
                              ? "max-h-[72%] max-w-[86%]"
                              : "max-h-[88%] max-w-[88%]",
                          ].join(" ")}
                        />
                      ) : (
                        <span className="font-serif text-3xl font-semibold text-stone-400 sm:text-4xl">
                          {getFigureInitials(figure.display_name)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Dedicated footer prevents logo/text overlap */}
                  <div className="absolute inset-x-0 bottom-0 h-[36%] border-t border-stone-200 bg-white p-3 sm:p-4">
                    <h2 className="text-base font-semibold leading-tight text-stone-900 sm:text-xl">
                      {figure.display_name}
                    </h2>

                    {figure.short_description && (
                      <p className="mt-1.5 line-clamp-3 text-[11px] leading-[1.35rem] text-stone-600 sm:text-sm sm:leading-5">
                        {figure.short_description}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Person card: portrait fills the card */}
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#e4dfcf] to-[#c9c2ab]">
                    <span className="font-serif text-3xl font-semibold text-stone-500/70 sm:text-4xl">
                      {getFigureInitials(figure.display_name)}
                    </span>
                  </div>

                  {!imageFailed && (
                    <img
                      src={getFigureImage(figure)}
                      alt={figure.display_name}
                      loading="lazy"
                      onError={() =>
                        setFailedImages((current) => ({
                          ...current,
                          [figure.slug]: true,
                        }))
                      }
                      className="absolute inset-0 h-full w-full object-cover object-top transition duration-300 group-hover:scale-[1.025]"
                    />
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-transparent" />

                  <div className="absolute inset-x-0 bottom-0 p-3 sm:p-4">
                    <h2 className="font-serif text-lg font-semibold leading-tight text-white sm:text-2xl">
                      {figure.display_name}
                    </h2>

                    {lifeYears && (
                      <p className="mt-1 text-[11px] font-medium text-white/75 sm:text-sm">
                        {lifeYears}
                      </p>
                    )}

                    {figure.short_description && (
                      <p className="mt-1.5 hidden text-sm leading-5 text-white/80 sm:line-clamp-2 sm:block">
                        {figure.short_description}
                      </p>
                    )}
                  </div>
                </>
              )}

              {isSelected && (
                <div
                  className={[
                    "absolute right-2.5 top-2.5 rounded-full px-2 py-1",
                    "text-[10px] font-semibold uppercase tracking-wide shadow-sm sm:right-3 sm:top-3 sm:text-xs",
                    organization
                      ? "bg-[#6f7252] text-white"
                      : "bg-[#f5f1e6]/95 text-[#55583e]",
                  ].join(" ")}
                >
                  Selected
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selectedFigure && (
        <div className="mt-7 rounded-2xl border border-stone-200 bg-[#faf8f2] p-4 sm:mt-9 sm:p-6">
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#74715f]">
              Start a conversation
            </p>

            <h2 className="mt-1 font-serif text-2xl font-semibold text-stone-900">
              Ask {displayFigureName}
            </h2>

            {selectedFigure.short_description && (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
                {selectedFigure.short_description}
              </p>
            )}
          </div>

          {suggestedQuestions.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {suggestedQuestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  disabled={isLoading}
                  onClick={() => onSelectSuggestedQuestion(question)}
                  className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-left text-sm leading-5 text-stone-700 transition hover:border-[#a4a58a] hover:bg-[#f5f3ea] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6f7252] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {question}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
