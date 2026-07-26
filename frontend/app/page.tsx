"use client";

import {
  FormEvent,
  ReactNode,
  useMemo,
  useState,
} from "react";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://127.0.0.1:8000";

const FIGURE_SLUG = "mahatma-gandhi";
const MATCH_COUNT = 5;

type SourceMetadata = {
  source_title?: string;
  source_key?: string;
  source_type?: string;
  publication_date?: string;
  author?: string;
  [key: string]: unknown;
};

type AnswerSource = {
  source_number: number;
  chunk_key: string;
  chunk_index: number;
  content: string;
  similarity: number;
  metadata: SourceMetadata;
};

type AnswerResponse = {
  question: string;
  figure_slug: string;
  answer: string;
  model: string;
  sources: AnswerSource[];
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: AnswerSource[];
};

const SUGGESTED_QUESTIONS = [
  "What did Gandhi mean by nonviolence?",
  "How did Gandhi describe swaraj?",
  "What were Gandhi's views on machinery?",
  "What did Gandhi believe about education?",
];

function getSourceTitle(source: AnswerSource): string {
  return (
    source.metadata.source_title ??
    "Unknown source"
  );
}

function getSourceTypeLabel(
  source: AnswerSource,
): string {
  const sourceType =
    source.metadata.source_type?.toLowerCase();

  if (!sourceType) {
    return "Historical source";
  }

  if (sourceType.includes("speech")) {
    return "Speech transcript";
  }

  if (sourceType.includes("book")) {
    return "Published work";
  }

  if (sourceType.includes("article")) {
    return "Article";
  }

  if (sourceType.includes("letter")) {
    return "Letter";
  }

  return source.metadata.source_type ??
    "Historical source";
}

function renderAnswerWithCitations(
  answer: string,
  sources: AnswerSource[],
  onCitationClick: (
    source: AnswerSource,
  ) => void,
): ReactNode[] {
  const citationPattern = /\[(\d+)\]/g;
  const parts: ReactNode[] = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while (
    (match = citationPattern.exec(answer)) !== null
  ) {
    const citationStart = match.index;
    const citationEnd =
      citationStart + match[0].length;

    if (citationStart > lastIndex) {
      parts.push(
        answer.slice(lastIndex, citationStart),
      );
    }

    const sourceNumber = Number(match[1]);

    const source = sources.find(
      (item) =>
        item.source_number === sourceNumber,
    );

    if (source) {
      parts.push(
        <button
          key={`${citationStart}-${sourceNumber}`}
          type="button"
          onClick={() =>
            onCitationClick(source)
          }
          className="mx-0.5 inline-flex min-w-6 items-center justify-center rounded-md bg-amber-100 px-1.5 py-0.5 align-baseline text-xs font-semibold text-amber-900 transition hover:bg-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-700"
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

  if (lastIndex < answer.length) {
    parts.push(answer.slice(lastIndex));
  }

  return parts;
}

export default function Home() {
  const [question, setQuestion] =
    useState("");

  const [messages, setMessages] =
    useState<ChatMessage[]>([]);

  const [selectedSource, setSelectedSource] =
    useState<AnswerSource | null>(null);

  const [isLoading, setIsLoading] =
    useState(false);

  const [errorMessage, setErrorMessage] =
    useState("");

  const latestAssistantMessage = useMemo(
    () =>
      [...messages]
        .reverse()
        .find(
          (message) =>
            message.role === "assistant",
        ),
    [messages],
  );

  const visibleSources =
    latestAssistantMessage?.sources ?? [];

  function selectSuggestedQuestion(
    suggestedQuestion: string,
  ) {
    setQuestion(suggestedQuestion);
  }

  function selectSource(
    source: AnswerSource,
  ) {
    setSelectedSource(source);

    window.setTimeout(() => {
      document
        .getElementById("evidence-panel")
        ?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
    }, 0);
  }

  async function submitQuestion(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const trimmedQuestion =
      question.trim();

    if (
      !trimmedQuestion ||
      isLoading
    ) {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedQuestion,
    };

    setMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
    ]);

    setQuestion("");
    setErrorMessage("");
    setIsLoading(true);
    setSelectedSource(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/chat/answer`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            question: trimmedQuestion,
            figure_slug: FIGURE_SLUG,
            match_count: MATCH_COUNT,
          }),
        },
      );

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => null);

        const errorDetail =
          errorData?.detail ??
          `Request failed with status ${response.status}.`;

        throw new Error(errorDetail);
      }

      const data: AnswerResponse =
        await response.json();

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.answer,
        sources: data.sources,
      };

      setMessages((currentMessages) => [
        ...currentMessages,
        assistantMessage,
      ]);

      if (data.sources.length > 0) {
        setSelectedSource(
          data.sources[0],
        );
      }
    } catch (error) {
      console.error(error);

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f3efe6] text-stone-900">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col">
        <header className="border-b border-stone-300 bg-[#f7f3eb] px-5 py-4 sm:px-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                RecChat
              </p>

              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
                Mahatma Gandhi
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <span className="rounded-full border border-olive-700 bg-[#e9eadc] px-3 py-1 text-xs font-medium text-[#53583d]">
                Source-grounded simulation
              </span>

              <span className="text-xs text-stone-500">
                5 historical works
              </span>
            </div>
          </div>
        </header>

        <div className="grid flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(340px,0.9fr)]">
          <section className="flex min-h-0 flex-col border-stone-300 lg:border-r">
            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-6 sm:px-8">
              {messages.length === 0 && (
                <section className="mx-auto max-w-3xl py-8 sm:py-14">
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#6b6f4c]">
                    A conversation through the archive
                  </p>

                  <h2 className="mt-4 max-w-2xl font-serif text-4xl leading-tight text-stone-900 sm:text-5xl">
                    Speak with Gandhi through
                    his writings and speeches.
                  </h2>

                  <p className="mt-5 max-w-2xl text-base leading-7 text-stone-600">
                    Responses are generated from the
                    historical sources in this collection.
                    They are not a claim to reproduce
                    Gandhi&apos;s exact words beyond the
                    retrieved evidence.
                  </p>

                  <div className="mt-8 grid gap-3 sm:grid-cols-2">
                    {SUGGESTED_QUESTIONS.map(
                      (suggestedQuestion) => (
                        <button
                          key={suggestedQuestion}
                          type="button"
                          onClick={() =>
                            selectSuggestedQuestion(
                              suggestedQuestion,
                            )
                          }
                          className="rounded-xl border border-stone-300 bg-[#faf8f2] p-4 text-left text-sm leading-6 text-stone-700 transition hover:border-[#7a7d59] hover:bg-white"
                        >
                          {suggestedQuestion}
                        </button>
                      ),
                    )}
                  </div>
                </section>
              )}

              {messages.map((message) => {
                const sources =
                  message.sources ?? [];

                return (
                  <article
                    key={message.id}
                    className={
                      message.role === "user"
                        ? "ml-auto max-w-2xl rounded-2xl bg-stone-800 px-5 py-4 text-stone-50"
                        : "max-w-3xl"
                    }
                  >
                    {message.role === "user" ? (
                      <>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-300">
                          You
                        </p>

                        <p className="text-sm leading-7 sm:text-base">
                          {message.content}
                        </p>
                      </>
                    ) : (
                      <div className="rounded-2xl border border-stone-300 bg-[#fbfaf6] px-5 py-6 shadow-sm sm:px-7">
                        <div className="mb-5 flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-stone-300 bg-[#e8e3d7] font-serif text-lg font-semibold text-stone-700">
                            G
                          </div>

                          <div>
                            <p className="text-sm font-semibold text-stone-900">
                              Gandhi
                            </p>

                            <p className="text-xs text-stone-500">
                              Generated from retrieved
                              historical evidence
                            </p>
                          </div>
                        </div>

                        <div className="whitespace-pre-wrap font-serif text-[1.05rem] leading-8 text-stone-800">
                          {renderAnswerWithCitations(
                            message.content,
                            sources,
                            selectSource,
                          )}
                        </div>

                        {sources.length > 0 && (
                          <div className="mt-6 border-t border-stone-200 pt-4">
                            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                              Evidence used
                            </p>

                            <div className="flex flex-wrap gap-2">
                              {sources.map(
                                (source) => (
                                  <button
                                    key={
                                      source.chunk_key
                                    }
                                    type="button"
                                    onClick={() =>
                                      selectSource(
                                        source,
                                      )
                                    }
                                    className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-700 transition hover:border-[#777b55] hover:bg-[#f1f1e7]"
                                  >
                                    [
                                    {
                                      source.source_number
                                    }
                                    ]{" "}
                                    {getSourceTitle(
                                      source,
                                    )}
                                  </button>
                                ),
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}

              {isLoading && (
                <div className="max-w-3xl rounded-2xl border border-stone-300 bg-[#fbfaf6] px-6 py-5">
                  <div className="flex items-center gap-3">
                    <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#6b6f4c]" />
                    <p className="text-sm text-stone-600">
                      Searching the archive and
                      preparing a grounded response…
                    </p>
                  </div>
                </div>
              )}

              {errorMessage && (
                <div className="max-w-3xl rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {errorMessage}
                </div>
              )}
            </div>

            <form
              onSubmit={submitQuestion}
              className="sticky bottom-0 border-t border-stone-300 bg-[#f3efe6] px-5 py-4 sm:px-8"
            >
              <div className="mx-auto flex max-w-3xl items-end gap-3 rounded-2xl border border-stone-300 bg-white p-3 shadow-lg">
                <textarea
                  value={question}
                  onChange={(event) =>
                    setQuestion(
                      event.target.value,
                    )
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey
                    ) {
                      event.preventDefault();

                      event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  rows={2}
                  disabled={isLoading}
                  placeholder="Ask Gandhi a question..."
                  className="min-h-14 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-6 outline-none placeholder:text-stone-400 disabled:cursor-not-allowed sm:text-base"
                />

                <button
                  type="submit"
                  disabled={
                    isLoading ||
                    !question.trim()
                  }
                  className="rounded-xl bg-[#4f5339] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#3f422e] disabled:cursor-not-allowed disabled:bg-stone-300"
                >
                  {isLoading
                    ? "Thinking…"
                    : "Send"}
                </button>
              </div>

              <p className="mt-2 text-center text-xs text-stone-500">
                AI-generated interpretation based on
                retrieved sources. Review the evidence
                for important claims.
              </p>
            </form>
          </section>

          <aside
            id="evidence-panel"
            className="bg-[#ebe5d9] px-5 py-6 sm:px-8 lg:sticky lg:top-0 lg:h-[calc(100vh-81px)] lg:overflow-y-auto"
          >
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                Evidence panel
              </p>

              <h2 className="mt-2 font-serif text-2xl text-stone-900">
                Source passage
              </h2>
            </div>

            {!selectedSource ? (
              <div className="rounded-2xl border border-stone-300 bg-[#f8f5ee] p-5">
                <p className="text-sm leading-6 text-stone-600">
                  Ask a question, then select a citation
                  to inspect the passage used in the
                  answer.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-2xl border border-stone-300 bg-[#faf8f2] p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <span className="inline-flex rounded-full bg-[#e6e8d7] px-2.5 py-1 text-xs font-semibold text-[#565a3d]">
                        {getSourceTypeLabel(
                          selectedSource,
                        )}
                      </span>

                      <h3 className="mt-3 font-serif text-2xl leading-tight text-stone-900">
                        {getSourceTitle(
                          selectedSource,
                        )}
                      </h3>

                      {selectedSource.metadata
                        .author && (
                        <p className="mt-1 text-sm text-stone-500">
                          {
                            selectedSource
                              .metadata.author
                          }
                        </p>
                      )}
                    </div>

                    <span className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-600">
                      [
                      {
                        selectedSource.source_number
                      }
                      ]
                    </span>
                  </div>

                  <div className="mt-5 border-t border-stone-200 pt-5">
                    <p className="whitespace-pre-wrap font-serif text-base leading-8 text-stone-800">
                      {selectedSource.content}
                    </p>
                  </div>
                </div>

                <details className="rounded-xl border border-stone-300 bg-[#f8f5ee]">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-stone-700">
                    Technical details
                  </summary>

                  <div className="space-y-2 border-t border-stone-300 px-4 py-4 text-xs text-stone-600">
                    <p>
                      Similarity:{" "}
                      {selectedSource.similarity.toFixed(
                        4,
                      )}
                    </p>

                    <p>
                      Chunk index:{" "}
                      {selectedSource.chunk_index}
                    </p>

                    <p className="break-all">
                      Chunk key:{" "}
                      {selectedSource.chunk_key}
                    </p>

                    {selectedSource.metadata
                      .publication_date && (
                      <p>
                        Publication date:{" "}
                        {
                          selectedSource
                            .metadata
                            .publication_date
                        }
                      </p>
                    )}
                  </div>
                </details>

                {visibleSources.length > 1 && (
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                      Other retrieved passages
                    </p>

                    <div className="space-y-2">
                      {visibleSources.map(
                        (source) => (
                          <button
                            key={source.chunk_key}
                            type="button"
                            onClick={() =>
                              setSelectedSource(
                                source,
                              )
                            }
                            className={
                              source.chunk_key ===
                              selectedSource.chunk_key
                                ? "w-full rounded-xl border border-[#767a55] bg-[#e4e5d3] p-3 text-left"
                                : "w-full rounded-xl border border-stone-300 bg-[#f8f5ee] p-3 text-left transition hover:border-[#767a55] hover:bg-white"
                            }
                          >
                            <p className="text-sm font-medium text-stone-800">
                              [
                              {
                                source.source_number
                              }
                              ]{" "}
                              {getSourceTitle(
                                source,
                              )}
                            </p>

                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-500">
                              {source.content}
                            </p>
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}