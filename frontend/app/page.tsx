"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AnalyticsConsent from "@/components/AnalyticsConsent";
import AppHeader from "@/components/AppHeader";
import ChatComposer from "@/components/ChatComposer";
import ChatMessageCard from "@/components/ChatMessageCard";
import EvidencePanel from "@/components/EvidencePanel";
import FigureLanding from "@/components/FigureLanding";
import { fetchFigures, StreamStatus, StreamFailure, AnswerType, streamAnswer, submitAnswerFeedback, warmBackend } from "@/lib/api";
import { elapsedMs, trackEvent } from "@/lib/analytics";
import { BRAND } from "@/lib/brand";
import { buildSuggestedQuestions } from "@/lib/figure";
import { AnswerSource, ChatMessage, Figure } from "@/lib/types";

type FeedbackContext = {
  responseId: string;
  requestId: string;
  conversationId: string;
  questionNumber: number;
  completedAt: number;
  question: string;
  figureSlug: string;
};

type ResponseContext = Omit<FeedbackContext, "completedAt"> & {
  completedAt?: number;
};
type EvidenceView = {
  id: string;
  messageId: string;
  context: ResponseContext;
  openedAt: number;
  chunks: Set<string>;
};

function responseProperties(context: ResponseContext) {
  return {
    response_id: context.responseId,
    request_id: context.requestId,
    conversation_id: context.conversationId,
    question_number: context.questionNumber,
    figure_slug: context.figureSlug,
  };
}

export default function Home() {
  const [figures, setFigures] = useState<Figure[]>([]);
  const [selectedFigureSlug, setSelectedFigureSlug] = useState("");
  const [isFiguresLoading, setIsFiguresLoading] = useState(true);
  const [figuresError, setFiguresError] = useState("");
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedSource, setSelectedSource] = useState<AnswerSource | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [streamingStage, setStreamingStage] = useState<StreamStatus | null>(null);
  const [blockedMessageIds, setBlockedMessageIds] = useState<Set<string>>(() => new Set());
  const [errorMessage, setErrorMessage] = useState("");
  const [feedbackContexts, setFeedbackContexts] = useState<Record<string, FeedbackContext>>({});
  const [feedbackRatings, setFeedbackRatings] = useState<Record<string, 1 | -1>>({});
  const [feedbackPendingIds, setFeedbackPendingIds] = useState<Set<string>>(() => new Set());
  const [feedbackErrorIds, setFeedbackErrorIds] = useState<Set<string>>(() => new Set());
  const responseContextsRef = useRef<Record<string, ResponseContext>>({});
  const evidenceViewRef = useRef<EvidenceView | null>(null);
  const [evidenceQuestion, setEvidenceQuestion] = useState("");
  const feedbackInFlightRef = useRef(new Set<string>());
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const conversationIdRef = useRef<string | null>(null);
  const questionNumberRef = useRef(0);
  const submissionInFlightRef = useRef(false);
  const figureSelectedAtRef = useRef<number | null>(null);
  const figuresSelectedCountRef = useRef(0);
  const suggestedQuestionRef = useRef<{ text: string; id: string } | null>(null);
  const previousAnswerCompletedAtRef = useRef<number | null>(null);

  const selectedFigure = useMemo(
    () => figures.find((figure) => figure.slug === selectedFigureSlug) ?? null,
    [figures, selectedFigureSlug],
  );
  const displayFigureName = selectedFigure?.display_name ?? BRAND.genericPerspectiveName;
  const suggestedQuestions = useMemo(
    () => selectedFigure ? buildSuggestedQuestions(selectedFigure.display_name) : [],
    [selectedFigure],
  );
  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant"),
    [messages],
  );
  const visibleSources = latestAssistantMessage?.sources ?? [];

  useEffect(() => {
    let isCancelled = false;
    async function loadFigures() {
      const startedAt = performance.now();
      try {
        setIsFiguresLoading(true);
        setFiguresError("");
        const data = await fetchFigures();
        if (!isCancelled) {
          setFigures(data.figures);
          trackEvent("figures_loaded", {
            figure_count: data.figures.length,
            loading_duration_ms: elapsedMs(startedAt),
            load_status: "success",
          });
        }
      } catch (error) {
        if (!isCancelled) {
          setFiguresError(error instanceof Error ? error.message : "Unable to load available perspectives.");
          trackEvent("figures_loaded", {
            figure_count: 0,
            loading_duration_ms: elapsedMs(startedAt),
            load_status: "failure",
            error_type: "figure_load_error",
          });
        }
      } finally {
        if (!isCancelled) setIsFiguresLoading(false);
      }
    }
    loadFigures();
    void warmBackend().catch((error) => {
      console.warn("Backend warmup did not complete:", error);
    });
    return () => { isCancelled = true; };
  }, []);

  useEffect(() => {
    function updateAutoScrollPreference() {
      const documentElement = document.documentElement;
      const distanceFromBottom = documentElement.scrollHeight - window.innerHeight - window.scrollY;
      shouldAutoScrollRef.current = distanceFromBottom < 180;
    }
    updateAutoScrollPreference();
    window.addEventListener("scroll", updateAutoScrollPreference, { passive: true });
    return () => window.removeEventListener("scroll", updateAutoScrollPreference);
  }, []);

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, streamingMessageId, streamingStage]);

  function changeFigure(figureSlug: string) {
    if (isLoading || submissionInFlightRef.current || figureSlug === selectedFigureSlug) return;
    closeEvidence("figure_changed");
    responseContextsRef.current = {};
    figureSelectedAtRef.current = performance.now();
    figuresSelectedCountRef.current += 1;
    trackEvent("figure_selected", {
      figure_slug: figureSlug,
      previous_figure_slug: selectedFigureSlug || null,
      selection_type: selectedFigureSlug ? "switch" : "initial",
      time_since_page_load_ms: elapsedMs(0),
      figures_selected_count: figuresSelectedCountRef.current,
    });
    suggestedQuestionRef.current = null;
    previousAnswerCompletedAtRef.current = null;
    conversationIdRef.current = null;
    questionNumberRef.current = 0;
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

  function selectSuggestedQuestion(suggestedQuestion: string) {
    const index = suggestedQuestions.indexOf(suggestedQuestion);
    suggestedQuestionRef.current = index >= 0
      ? { text: suggestedQuestion, id: `suggestion_${index + 1}` }
      : null;
    if (index >= 0) {
      trackEvent("suggested_question_clicked", {
        figure_slug: selectedFigureSlug,
        suggested_question_id: `suggestion_${index + 1}`,
        suggestion_position: index + 1,
        time_since_figure_selected_ms: figureSelectedAtRef.current === null
          ? undefined : elapsedMs(figureSelectedAtRef.current),
      });
    }
    setQuestion(suggestedQuestion);
  }
  function changeQuestion(value: string) {
    if (value !== suggestedQuestionRef.current?.text) {
      suggestedQuestionRef.current = null;
    }
    setQuestion(value);
  }
  function closeEvidence(reason: "manual" | "figure_changed" | "new_question") {
    const view = evidenceViewRef.current;
    if (view) {
      trackEvent("evidence_panel_closed", {
        ...responseProperties(view.context),
        evidence_view_id: view.id,
        evidence_duration_ms: elapsedMs(view.openedAt),
        sources_viewed_count: view.chunks.size,
        close_reason: reason,
      });
      evidenceViewRef.current = null;
    }
    setSelectedSource(null);
    setEvidenceQuestion("");
  }
  function selectSource(messageId: string, source: AnswerSource) {
    const context = responseContextsRef.current[messageId];
    if (!context) return;
    let view = evidenceViewRef.current;
    if (view && view.messageId !== messageId) {
      closeEvidence("manual");
      view = null;
    }
    if (!view) {
      view = {
        id: crypto.randomUUID(), messageId, context,
        openedAt: performance.now(), chunks: new Set<string>(),
      };
      evidenceViewRef.current = view;
    }
    view.chunks.add(source.chunk_key);
    trackEvent("citation_clicked", {
      ...responseProperties(context),
      evidence_view_id: view.id,
      source_key: source.metadata?.source_key,
      chunk_key: source.chunk_key,
      citation_number: source.source_number,
      time_since_answer_completed_ms: context.completedAt === undefined
        ? undefined : elapsedMs(context.completedAt),
    });
    setEvidenceQuestion(context.question);
    setSelectedSource(source);
  }
  function updateAssistantMessage(messageId: string, updater: (message: ChatMessage) => ChatMessage) {
    setMessages((currentMessages) => currentMessages.map((message) => message.id === messageId ? updater(message) : message));
  }

  async function handleFeedback(messageId: string, rating: 1 | -1) {
    const context = feedbackContexts[messageId];
    const message = messages.find((candidate) => candidate.id === messageId);
    if (!context || !message || !message.content || feedbackPendingIds.has(messageId) || feedbackInFlightRef.current.has(messageId) || feedbackRatings[messageId] === rating) return;
    feedbackInFlightRef.current.add(messageId);
    const previousRating = feedbackRatings[messageId];
    const feedbackDelayMs = elapsedMs(context.completedAt);
    setFeedbackRatings((current) => ({ ...current, [messageId]: rating }));
    setFeedbackPendingIds((current) => { const next = new Set(current); next.add(messageId); return next; });
    setFeedbackErrorIds((current) => { const next = new Set(current); next.delete(messageId); return next; });
    try {
      await submitAnswerFeedback(context.responseId, context.figureSlug, context.question, message.content, rating);
      trackEvent("feedback_submitted", {
        ...responseProperties(context),
        rating,
        previous_rating: previousRating,
        is_rating_changed: previousRating !== undefined && previousRating !== rating,
        time_since_answer_completed_ms: feedbackDelayMs,
      });
    } catch (error) {
      console.error(error);
      setFeedbackRatings((current) => {
        const next = { ...current };
        if (previousRating) next[messageId] = previousRating;
        else delete next[messageId];
        return next;
      });
      setFeedbackErrorIds((current) => { const next = new Set(current); next.add(messageId); return next; });
    } finally {
      feedbackInFlightRef.current.delete(messageId);
      setFeedbackPendingIds((current) => { const next = new Set(current); next.delete(messageId); return next; });
    }
  }

  async function submitQuestion() {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || !selectedFigure || isLoading || submissionInFlightRef.current) return;
    closeEvidence("new_question");
    submissionInFlightRef.current = true;
    const submittedAt = performance.now();
    shouldAutoScrollRef.current = true;
    const conversationId = conversationIdRef.current ?? crypto.randomUUID();
    conversationIdRef.current = conversationId;
    const questionNumber = ++questionNumberRef.current;
    const requestId = crypto.randomUUID();
    const figureSlug = selectedFigure.slug;
    const suggestion = suggestedQuestionRef.current;
    const questionType = suggestion?.text.trim() === trimmedQuestion
      ? "suggested_question" : "typed";
    const identity = {
      figure_slug: figureSlug,
      conversation_id: conversationId,
      request_id: requestId,
      question_number: questionNumber,
    };
    if (questionNumber === 1) {
      trackEvent("conversation_started", {
        ...identity,
        entry_type: questionType,
        time_since_figure_selected_ms: figureSelectedAtRef.current === null
          ? undefined : elapsedMs(figureSelectedAtRef.current),
      });
    }
    trackEvent("question_submitted", {
      ...identity,
      question_length_chars: trimmedQuestion.length,
      question_type: questionType,
      suggested_question_id: questionType === "suggested_question" ? suggestion?.id : undefined,
      time_since_previous_answer_ms: previousAnswerCompletedAtRef.current === null
        ? undefined : elapsedMs(previousAnswerCompletedAtRef.current),
    });
    suggestedQuestionRef.current = null;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content: trimmedQuestion };
    const assistantMessageId = crypto.randomUUID();
    const assistantMessage: ChatMessage = { id: assistantMessageId, role: "assistant", content: "", sources: [] };
    let responseId: string | null = null;
    let wasBlocked = false;
    let firstTextAt: number | null = null;
    let answerText = "";
    let answerSources: AnswerSource[] = [];
    let generationModel: string | null = null;
    let answerType: AnswerType | null = null;
    let failureStage: "checking" | "searching" | "preparing" | "streaming" = "checking";
    const responseIdentity = () => ({ ...identity, response_id: responseId ?? undefined });
    setMessages((currentMessages) => [...currentMessages, userMessage, assistantMessage]);
    setQuestion("");
    setErrorMessage("");
    setSelectedSource(null);
    setIsLoading(true);
    setStreamingMessageId(assistantMessageId);
    setStreamingStage("checking");
    try {
      await streamAnswer(trimmedQuestion, figureSlug, {
        onMeta: (backendResponseId) => {
          responseId = backendResponseId;
          responseContextsRef.current[assistantMessageId] = {
            responseId: backendResponseId, requestId, conversationId,
            questionNumber, question: trimmedQuestion, figureSlug,
          };
        },
        onStatus: (status) => { failureStage = status; setStreamingStage(status); },
        onSources: (sources) => {
          answerSources = sources;
          failureStage = "preparing";
          setStreamingStage("preparing");
          updateAssistantMessage(assistantMessageId, (message) => ({ ...message, sources }));
        },
        onDelta: (text) => {
          answerText += text;
          if (firstTextAt === null && text.trim()) {
            firstTextAt = performance.now();
            trackEvent("answer_started", { ...responseIdentity(), ttft_ms: Math.round(firstTextAt - submittedAt) });
          }
          failureStage = "streaming";
          setStreamingStage(null);
          updateAssistantMessage(assistantMessageId, (message) => ({ ...message, content: message.content + text }));
        },
        onBlocked: (message, categories) => {
          wasBlocked = true;
          trackEvent("question_blocked", { ...responseIdentity(), block_categories: categories, elapsed_ms: elapsedMs(submittedAt) });
          setStreamingStage(null);
          setBlockedMessageIds((current) => { const next = new Set(current); next.add(assistantMessageId); return next; });
          updateAssistantMessage(assistantMessageId, (currentMessage) => ({ ...currentMessage, content: message, sources: [] }));
        },
        onDone: (model, type) => { generationModel = model; answerType = type; },
      }, 5, requestId);
      // Only completed, non-blocked responses may receive feedback.
      if (!wasBlocked && responseId) {
        const completedAt = performance.now();
        previousAnswerCompletedAtRef.current = completedAt;
        const validNumbers = new Set(answerSources.map(source => source.source_number));
        const citations = new Set([...answerText.matchAll(/\[(\d+)\]/g)].map(match => Number(match[1])).filter(number => validNumbers.has(number)));
        trackEvent("answer_completed", {
          ...responseIdentity(), answer_type: answerType ?? undefined,
          total_latency_ms: Math.round(completedAt - submittedAt),
          ttft_ms: firstTextAt === null ? undefined : Math.round(firstTextAt - submittedAt),
          streaming_duration_ms: firstTextAt === null ? undefined : Math.round(completedAt - firstTextAt),
          answer_length_chars: answerText.length, source_count: answerSources.length,
          citation_count: citations.size, generation_model: generationModel ?? undefined,
        });
        const context: FeedbackContext = { responseId, requestId, conversationId, questionNumber, completedAt, question: trimmedQuestion, figureSlug };
        const responseContext = responseContextsRef.current[assistantMessageId];
        if (responseContext) responseContext.completedAt = completedAt;
        setFeedbackContexts((current) => ({ ...current, [assistantMessageId]: context }));
      }
    } catch (error) {
      console.error(error);
      if (!wasBlocked) trackEvent("answer_failed", {
        ...responseIdentity(), elapsed_ms: elapsedMs(submittedAt),
        error_type: error instanceof StreamFailure ? error.errorType : "unknown",
        http_status_code: error instanceof StreamFailure ? error.httpStatus : undefined,
        failure_stage: failureStage, partial_answer_received: answerText.trim().length > 0,
      });
      setMessages((currentMessages) => currentMessages.filter((message) => message.id !== assistantMessageId || Boolean(message.content)));
      setErrorMessage(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      submissionInFlightRef.current = false;
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
          suggestedQuestions={messages.length === 0 ? suggestedQuestions : []}
          isFiguresLoading={isFiguresLoading}
          isLoading={isLoading}
          onChangeFigure={changeFigure}
          onSelectSuggestedQuestion={selectSuggestedQuestion}
        />
        {figuresError && (
          <div className="mx-4 mb-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 sm:mx-8">{figuresError}</div>
        )}
        {selectedFigure && (
          <section className="flex min-h-0 w-full flex-1 flex-col">
            <div className="mx-auto w-full max-w-6xl flex-1 px-4 pb-6 sm:px-6">
              <div className="mx-auto max-w-3xl space-y-5 sm:space-y-6">
                {messages.map((message) => {
                  const isAssistant = message.role === "assistant";
                  const isStreaming = message.id === streamingMessageId;
                  const isBlocked = blockedMessageIds.has(message.id);
                  const feedbackContext = feedbackContexts[message.id];
                  return (
                    <ChatMessageCard
                      key={message.id}
                      message={message}
                      selectedFigure={selectedFigure}
                      onSelectSource={(source) => selectSource(message.id, source)}
                      isStreaming={isStreaming}
                      loadingStage={isStreaming ? streamingStage : null}
                      isBlocked={isBlocked}
                      feedbackRating={feedbackRatings[message.id] ?? null}
                      feedbackPending={feedbackPendingIds.has(message.id)}
                      feedbackError={feedbackErrorIds.has(message.id)}
                      onFeedback={isAssistant && feedbackContext && !isBlocked && !isStreaming ? (rating) => handleFeedback(message.id, rating) : undefined}
                    />
                  );
                })}
                {errorMessage && (
                  <div className="max-w-3xl rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">{errorMessage}</div>
                )}
                <div ref={messagesEndRef} aria-hidden="true" className="h-px" />
              </div>
            </div>
            <ChatComposer question={question} displayFigureName={displayFigureName} isLoading={isLoading} isDisabled={!selectedFigure} onQuestionChange={changeQuestion} onSubmit={submitQuestion} />
          </section>
        )}
        {!selectedFigure && !isFiguresLoading && (
          <div className="mt-auto px-4 pb-6 sm:px-8"><p className="text-center text-xs text-stone-500">{BRAND.emptyState}</p></div>
        )}
        <AnalyticsConsent />
      </div>
      <EvidencePanel selectedSource={selectedSource} visibleSources={visibleSources} onSelectSource={(source) => {
        const messageId = evidenceViewRef.current?.messageId;
        if (messageId) selectSource(messageId, source);
      }} onClose={() => closeEvidence("manual")} query={evidenceQuestion} />
    </main>
  );
}
