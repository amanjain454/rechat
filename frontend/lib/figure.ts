import { AnswerSource } from "@/lib/types";

export function buildSuggestedQuestions(figureName: string): string[] {
  // Build generic starter questions for a selected historical figure.
  return [
    `What ideas appear most often in ${figureName}'s work?`,
    `What problems was ${figureName} trying to address?`,
    `How did ${figureName}'s views develop over time?`,
    `What does the archive reveal about ${figureName}'s worldview?`,
  ];
}

export function getFigureInitials(displayName: string): string {
  // Create short initials for the selected figure's avatar.
  return displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export function getSourceTitle(source: AnswerSource): string {
  // Return a readable title for a retrieved source.
  return source.metadata.source_title ?? "Unknown source";
}

export function getSourceTypeLabel(source: AnswerSource): string {
  // Convert backend source types into readable evidence labels.
  const sourceType = source.metadata.source_type?.toLowerCase();

  if (!sourceType) return "Historical source";
  if (sourceType === "direct_writing") return "Direct writing";
  if (sourceType === "third_party_commentary") return "Third-party commentary";
  if (sourceType === "mixed_collection") return "Mixed collection";
  if (sourceType === "transmitted_teachings") return "Transmitted teachings";
  if (sourceType.includes("speech")) return "Speech transcript";
  if (sourceType.includes("book")) return "Published work";
  if (sourceType.includes("article")) return "Article";
  if (sourceType.includes("letter")) return "Letter";

  return source.metadata.source_type ?? "Historical source";
}

export function formatEvidenceText(text: string): string {
  // Remove artificial source line breaks while preserving real paragraph breaks.
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}