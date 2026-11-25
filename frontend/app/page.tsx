"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import AppHeader from "@/components/AppHeader";
import ChatComposer from "@/components/ChatComposer";
import ChatMessageCard from "@/components/ChatMessageCard";
import EvidencePanel from "@/components/EvidencePanel";
import FigureLanding from "@/components/FigureLanding";
import {
  fetchFigures,
  StreamStatus,
  streamAnswer,
  submitAnswerFeedback,
  warmBackend,
} from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { buildSuggestedQuestions } from "@/lib/figure";
import {
  AnswerSource,
  ChatMessage,
  Figure,
} from "@/lib/types";

type FeedbackContext = {
  responseId: string;
  question: string;
  figureSlug: string;
};

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
  const [streamingStage, setStreamingStage] =
    useState<StreamStatus | null>(null);
  const [blockedMessageIds, setBlockedMessageIds] =
    useState<Set<string>>(() => new Set());
  const [errorMessage, setErrorMessage] = useState("");

  const [feedbackContexts, setFeedbackContexts] =
    useState<Record<string, FeedbackContext>>({});
  const [feedbackRatings, setFeedbackRatings] =
    useState<Record<string, 1 | -1>>({});
  const [feedbackPendingIds, setFeedbackPendingIds] =
    useState<Set<string>>(() => new Set());
  const [feedbackErrorIds, setFeedbackErrorIds] =
    useState<Set<string>>(() => new Set());

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

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

    loadFigures();

    void warmBackend().catch((error) => {
      console.warn(
        "Backend warmup did not complete:",
        error,
      );
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    function updateAutoScrollPreference() {
      const documentElement =
        document.documentElement;

      const distanceFromBottom =
        documentElement.scrollHeight -
        window.innerHeight -
        window.scrollY;

      shouldAutoScrollRef.current =
        distanceFromBottom < 180;
    }

    updateAutoScrollPreference();

    window.addEventListener(
      "scroll",
      updateAutoScrollPreference,
      { passive: true },
    );

    return () => {
      window.removeEventListener(
        "scroll",
        updateAutoScrollPreference,
      );
    };
  }, []);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({
        block: "end",
        behavior: "auto",
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [
    messages,
    streamingMessageId,
    streamingStage,
  ]);

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
    setStreamingStage(null);
    setBlockedMessageIds(new Set());
    setFeedbackContexts({});
    setFeedbackRatings({});
    setFeedbackPendingIds(new Set());
    setFeedbackErrorIds(new Set());
    shouldAutoScrollRef.current = true;
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

  async function handleFeedback(
    messageId: string,
    rating: 1 | -1,
  ) {
    const context = feedbackContexts[messageId];
    const message = messages.find(
      (candidate) => candidate.id === messageId,
    );

    if (
      !context ||
      !message ||
      !message.content ||
      feedbackPendingIds.has(messageId) ||
      feedbackRatings[messageId] === rating
    ) {
      return;
    }

    const previousRating =
      feedbackRatings[messageId];

    setFeedbackRatings((current) => ({
      ...current,
      [messageId]: rating,
    }));

    setFeedbackPendingIds((current) => {
      const next = new Set(current);
      next.add(messageId);
      return next;
    });

    setFeedbackErrorIds((current) => {
      const next = new Set(current);
      next.delete(messageId);
      return next;
    });

    try {
      await submitAnswerFeedback(
        context.responseId,
        context.figureSlug,
        context.question,
        message.content,
        rating,
      );
    } catch (error) {
      console.error(error);

      setFeedbackRatings((current) => {
        const next = { ...current };

        if (previousRating) {
          next[messageId] = previousRating;
        } else {
          delete next[messageId];
        }

        return next;
      });

      setFeedbackErrorIds((current) => {
        const next = new Set(current);
        next.add(messageId);
        return next;
      });
    } finally {
      setFeedbackPendingIds((current) => {
        const next = new Set(current);
        next.delete(messageId);
        return next;
      });
    }
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

    shouldAutoScrollRef.current = true;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedQuestion,
    };

    const assistantMessageId = crypto.randomUUID();
    const responseId = crypto.randomUUID();

    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      sources: [],
    };

    setFeedbackContexts((current) => ({
      ...current,
      [assistantMessageId]: {
        responseId,
        question: trimmedQuestion,
        figureSlug: selectedFigure.slug,
      },
    }));

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
    setStreamingStage("checking");

    try {
      await streamAnswer(
        trimmedQuestion,
        selectedFigure.slug,
        {
          onStatus: (status) => {
            setStreamingStage(status);
          },

          onSources: (sources) => {
            setStreamingStage("preparing");

            updateAssistantMessage(
              assistantMessageId,
              (message) => ({
                ...message,
                sources,
              }),
            );
          },

          onDelta: (text) => {
            setStreamingStage(null);

            updateAssistantMessage(
              assistantMessageId,
              (message) => ({
                ...message,
                content: message.content + text,
              }),
            );
          },

          onBlocked: (message) => {
            setStreamingStage(null);

            setBlockedMessageIds((current) => {
              const next = new Set(current);
              next.add(assistantMessageId);
              return next;
            });

            updateAssistantMessage(
              assistantMessageId,
              (currentMessage) => ({
                ...currentMessage,
                content: message,
                sources: [],
              }),
            );
          },
        },
      );
    } catch (error) {
      console.error(error);

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
      setStreamingStage(null);
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
                {messages.map((message) => {
                  const isAssistant =
                    message.role === "assistant";
                  const isStreaming =
                    message.id === streamingMessageId;
                  const isBlocked =
                    blockedMessageIds.has(message.id);
                  const feedbackContext =
                    feedbackContexts[message.id];

                  return (
                    <ChatMessageCard
                      key={message.id}
                      message={message}
                      selectedFigure={selectedFigure}
                      onSelectSource={selectSource}
                      isStreaming={isStreaming}
                      loadingStage={
                        isStreaming
                          ? streamingStage
                          : null
                      }
                      isBlocked={isBlocked}
                      feedbackRating={
                        feedbackRatings[message.id] ?? null
                      }
                      feedbackPending={
                        feedbackPendingIds.has(message.id)
                      }
                      feedbackError={
                        feedbackErrorIds.has(message.id)
                      }
                      onFeedback={
                        isAssistant &&
                        feedbackContext &&
                        !isBlocked &&
                        !isStreaming
                          ? (rating) =>
                              handleFeedback(
                                message.id,
                                rating,
                              )
                          : undefined
                      }
                    />
                  );
                })}

                {errorMessage && (
                  <div className="max-w-3xl rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {errorMessage}
                  </div>
                )}

                <div
                  ref={messagesEndRef}
                  aria-hidden="true"
                  className="h-px"
                />
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
