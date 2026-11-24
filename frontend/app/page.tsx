"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import AppHeader from "@/components/AppHeader";
import ChatComposer from "@/components/ChatComposer";
import ChatMessageCard from "@/components/ChatMessageCard";
import EvidencePanel from "@/components/EvidencePanel";
import FigureLanding from "@/components/FigureLanding";
import { fetchAnswer, fetchFigures } from "@/lib/api";
import { ROTATION_INTERVAL_MS } from "@/lib/config";
import { buildSuggestedQuestions } from "@/lib/figure";
import { AnswerSource, ChatMessage, Figure } from "@/lib/types";

export default function Home() {
  // Coordinate figure discovery, chat state, retrieval responses, and evidence.
  const [figures, setFigures] = useState<Figure[]>([]);
  const [selectedFigureSlug, setSelectedFigureSlug] = useState("");
  const [rotatingFigureIndex, setRotatingFigureIndex] = useState(0);
  const [isFiguresLoading, setIsFiguresLoading] = useState(true);
  const [figuresError, setFiguresError] = useState("");

  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [selectedSource, setSelectedSource] = useState<AnswerSource | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const selectedFigure = useMemo(
    () => figures.find((figure) => figure.slug === selectedFigureSlug) ?? null,
    [figures, selectedFigureSlug],
  );

  const rotatingFigure = figures[rotatingFigureIndex] ?? null;

  const displayFigureName =
    selectedFigure?.display_name ??
    rotatingFigure?.display_name ??
    "history";

  const suggestedQuestions = useMemo(
    () =>
      selectedFigure
        ? buildSuggestedQuestions(selectedFigure.display_name)
        : [],
    [selectedFigure],
  );

  const latestAssistantMessage = useMemo(
    () =>
      [...messages]
        .reverse()
        .find((message) => message.role === "assistant"),
    [messages],
  );

  const visibleSources = latestAssistantMessage?.sources ?? [];

  useEffect(() => {
    // Load figures once when the application starts.
    async function loadFigures() {
      try {
        setIsFiguresLoading(true);
        setFiguresError("");

        const data = await fetchFigures();
        setFigures(data.figures);
      } catch (error) {
        setFiguresError(
          error instanceof Error
            ? error.message
            : "Unable to load figures.",
        );
      } finally {
        setIsFiguresLoading(false);
      }
    }

    loadFigures();
  }, []);

  useEffect(() => {
    // Rotate figure names on the landing page until a figure is selected.
    if (selectedFigureSlug || figures.length <= 1) return;

    const interval = window.setInterval(() => {
      setRotatingFigureIndex(
        (index) => (index + 1) % figures.length,
      );
    }, ROTATION_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [figures, selectedFigureSlug]);

  function changeFigure(figureSlug: string) {
    // Switch figures and clear state from the previous conversation.
    setSelectedFigureSlug(figureSlug);
    setMessages([]);
    setQuestion("");
    setSelectedSource(null);
    setErrorMessage("");
  }

  function selectSource(source: AnswerSource) {
    // Select evidence and scroll it into view on smaller screens.
    setSelectedSource(source);

    window.setTimeout(() => {
      document.getElementById("evidence-panel")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  }

  async function submitQuestion(event: FormEvent<HTMLFormElement>) {
    // Submit the user's question and append the grounded response to the chat.
    event.preventDefault();

    const trimmedQuestion = question.trim();

    if (!trimmedQuestion || !selectedFigure || isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedQuestion,
    };

    setMessages((current) => [...current, userMessage]);
    setQuestion("");
    setErrorMessage("");
    setIsLoading(true);
    setSelectedSource(null);

    try {
      const data = await fetchAnswer(
        trimmedQuestion,
        selectedFigure.slug,
      );

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.answer,
        sources: data.sources,
      };

      setMessages((current) => [...current, assistantMessage]);

      if (data.sources.length > 0) {
        setSelectedSource(data.sources[0]);
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

        <AppHeader selectedFigure={selectedFigure} />

        <div className="grid flex-1 grid-cols-1 lg:grid-cols-[minmax(0,2.6fr)_minmax(300px,1fr)]">

          <section className="flex min-h-0 min-w-0 flex-col border-stone-300 lg:border-r">

            <div className="flex-1 space-y-6 overflow-y-auto px-5 py-6 sm:px-8">

              {messages.length === 0 && (
                <FigureLanding
                  figures={figures}
                  selectedFigure={selectedFigure}
                  selectedFigureSlug={selectedFigureSlug}
                  displayFigureName={displayFigureName}
                  suggestedQuestions={suggestedQuestions}
                  isFiguresLoading={isFiguresLoading}
                  isLoading={isLoading}
                  onChangeFigure={changeFigure}
                  onSelectSuggestedQuestion={setQuestion}
                />
              )}

              {messages.map((message) => (
                <ChatMessageCard
                  key={message.id}
                  message={message}
                  selectedFigure={selectedFigure}
                  onSelectSource={selectSource}
                />
              ))}

              {isLoading && (
                <div className="max-w-3xl rounded-2xl border border-stone-300 bg-[#fbfaf6] px-6 py-5">
                  <div className="flex items-center gap-3">
                    <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#6b6f4c]" />

                    <p className="text-sm text-stone-600">
                      Searching the archive and preparing a grounded response…
                    </p>
                  </div>
                </div>
              )}

              {figuresError && (
                <div className="max-w-3xl rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {figuresError}
                </div>
              )}

              {errorMessage && (
                <div className="max-w-3xl rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {errorMessage}
                </div>
              )}

            </div>

            <ChatComposer
              question={question}
              selectedFigure={selectedFigure}
              isLoading={isLoading}
              onQuestionChange={setQuestion}
              onSubmit={submitQuestion}
            />

          </section>

          <EvidencePanel
            selectedSource={selectedSource}
            visibleSources={visibleSources}
            onSelectSource={selectSource}
          />

        </div>
      </div>
    </main>
  );
}