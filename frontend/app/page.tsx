"use client";

import { useEffect, useMemo, useState } from "react";

import AppHeader from "@/components/AppHeader";
import ChatComposer from "@/components/ChatComposer";
import ChatMessageCard from "@/components/ChatMessageCard";
import EvidencePanel from "@/components/EvidencePanel";
import FigureLanding from "@/components/FigureLanding";
import {
  fetchFigures,
  streamAnswer,
  warmBackend,
} from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { buildSuggestedQuestions } from "@/lib/figure";
import {
  AnswerSource,
  ChatMessage,
  Figure,
} from "@/lib/types";

export default function Home() {
  const [figures, setFigures] = useState<Figure[]>([]);
  const [selectedFigureSlug, setSelectedFigureSlug] =
    useState("");

  const [isFiguresLoading, setIsFiguresLoading] =
    useState(true);
  const [figuresError, setFiguresError] = useState("");

  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedSource, setSelectedSource] =
    useState<AnswerSource | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] =
    useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const selectedFigure = useMemo(
    () =>
      figures.find(
        (figure) => figure.slug === selectedFigureSlug,
      ) ?? null,
    [figures, selectedFigureSlug],
  );

  const displayFigureName =
    selectedFigure?.display_name ??
    BRAND.genericPerspectiveName;

  const suggestedQuestions = useMemo(
    () =>
      selectedFigure
        ? buildSuggestedQuestions(
            selectedFigure.display_name,
          )
        : [],
    [selectedFigure],
  );

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

  const latestUserQuestion = useMemo(
    () =>
      [...messages]
        .reverse()
        .find(
          (message) => message.role === "user",
        )?.content ?? "",
    [messages],
  );

  useEffect(() => {
    let isCancelled = false;

    async function loadFigures() {
      try {
        setIsFiguresLoading(true);
        setFiguresError("");

        const data = await fetchFigures();

        if (!isCancelled) {
          setFigures(data.figures);
        }
      } catch (error) {
        if (!isCancelled) {
          setFiguresError(
            error instanceof Error
              ? error.message
              : "Unable to load available perspectives.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsFiguresLoading(false);
        }
      }
    }

    // These run independently:
    // 1. Figure metadata normally comes from Vercel's cache.
    // 2. Render wakes and warms in the background while the user browses.
    loadFigures();

    void warmBackend().catch((error) => {
      // Warmup should never block the landing experience. If it fails, the
      // normal chat request can still wake/use the backend as a fallback.
      console.warn("Backend warmup did not complete:", error);
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  function changeFigure(figureSlug: string) {
    if (
      isLoading ||
      figureSlug === selectedFigureSlug
    ) {
      return;
    }

    setSelectedFigureSlug(figureSlug);
    setMessages([]);
    setQuestion("");
    setSelectedSource(null);
    setErrorMessage("");
    setStreamingMessageId(null);
  }

  function selectSuggestedQuestion(
    suggestedQuestion: string,
  ) {
    setQuestion(suggestedQuestion);
  }

  function selectSource(source: AnswerSource) {
    setSelectedSource(source);
  }

  function updateAssistantMessage(
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) {
    setMessages((currentMessages) =>
      currentMessages.map((message) =>
        message.id === messageId
          ? updater(message)
          : message,
      ),
    );
  }

  async function submitQuestion() {
    const trimmedQuestion = question.trim();

    if (
      !trimmedQuestion ||
      !selectedFigure ||
      isLoading
    ) {
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedQuestion,
    };

    const assistantMessageId = crypto.randomUUID();

    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      sources: [],
    };

    setMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
      assistantMessage,
    ]);

    setQuestion("");
    setErrorMessage("");
    setSelectedSource(null);
    setIsLoading(true);
    setStreamingMessageId(assistantMessageId);

    try {
      await streamAnswer(
        trimmedQuestion,
        selectedFigure.slug,
        {
          onSources: (sources) => {
            updateAssistantMessage(
              assistantMessageId,
              (message) => ({
                ...message,
                sources,
              }),
            );
          },

          onDelta: (text) => {
            updateAssistantMessage(
              assistantMessageId,
              (message) => ({
                ...message,
                content: message.content + text,
              }),
            );
          },
        },
      );
    } catch (error) {
      console.error(error);

      // Remove an empty assistant placeholder if streaming failed before any
      // visible answer text arrived.
      setMessages((currentMessages) =>
        currentMessages.filter(
          (message) =>
            message.id !== assistantMessageId ||
            Boolean(message.content),
        ),
      );

      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Something went wrong.",
      );
    } finally {
      setStreamingMessageId(null);
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#f3efe6] text-stone-900">
      <div className="mx-auto flex min-h-dvh max-w-[1500px] flex-col">
        <AppHeader />

        <FigureLanding
          figures={figures}
          selectedFigure={selectedFigure}
          selectedFigureSlug={selectedFigureSlug}
          displayFigureName={displayFigureName}
          suggestedQuestions={
            messages.length === 0
              ? suggestedQuestions
              : []
          }
          isFiguresLoading={isFiguresLoading}
          isLoading={isLoading}
          onChangeFigure={changeFigure}
          onSelectSuggestedQuestion={
            selectSuggestedQuestion
          }
        />

        {figuresError && (
          <div className="mx-4 mb-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 sm:mx-8">
            {figuresError}
          </div>
        )}

        {selectedFigure && (
          <section className="flex min-h-0 w-full flex-1 flex-col">
            <div className="mx-auto w-full max-w-6xl flex-1 px-4 pb-6 sm:px-6">
              <div className="mx-auto max-w-3xl space-y-5 sm:space-y-6">
                {messages.map((message) => (
                  <ChatMessageCard
                    key={message.id}
                    message={message}
                    selectedFigure={selectedFigure}
                    onSelectSource={selectSource}
                    isStreaming={
                      message.id === streamingMessageId
                    }
                  />
                ))}

                {errorMessage && (
                  <div className="max-w-3xl rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {errorMessage}
                  </div>
                )}
              </div>
            </div>

            <ChatComposer
              question={question}
              displayFigureName={displayFigureName}
              isLoading={isLoading}
              isDisabled={!selectedFigure}
              onQuestionChange={setQuestion}
              onSubmit={submitQuestion}
            />
          </section>
        )}

        {!selectedFigure && !isFiguresLoading && (
          <div className="mt-auto px-4 pb-6 sm:px-8">
            <p className="text-center text-xs text-stone-500">
              {BRAND.emptyState}
            </p>
          </div>
        )}
      </div>

      <EvidencePanel
        selectedSource={selectedSource}
        visibleSources={visibleSources}
        onSelectSource={selectSource}
        onClose={() => setSelectedSource(null)}
        query={latestUserQuestion}
      />
    </main>
  );
}
