export const BRAND = {
  productName: "Perspective",
  tagline: "Explore ideas through a chosen perspective.",
  trustCue: "Grounded in real sources",

  landingHeadline: "Choose a perspective",
  landingDescription:
    "Explore the ideas, writings, and knowledge of people and institutions through their published sources.",

  selectedPerspectiveLabel: "Your perspective",
  changePerspectiveLabel: "Change",
  keepPerspectivePrefix: "Keep",

  cardFallbackDescription: "Source-backed perspective",
  genericPerspectiveName: "a perspective",

  composerDisabledPlaceholder: "Choose a perspective to begin...",
  composerPlaceholder: (name: string) => `Ask ${name} a question...`,
  composerHelper:
    "Answers are grounded in retrieved sources. Open citations to inspect the evidence.",

  answerAttribution: "Generated from retrieved source evidence",
  evidenceUsedLabel: "Evidence used",
  evidenceDrawerLabel: "Source evidence",
  relevantExcerptLabel: "Relevant excerpt",
  viewFullPassageLabel: "View full passage",
  hideFullPassageLabel: "Hide full passage",
  technicalDetailsLabel: "Technical details",

  loadingChecking: "Checking request…",
  loadingSearching: "Searching sources…",
  loadingPreparing: "Preparing answer…",

  safetyLabel: "Safety",
  feedbackPrompt: "Helpful?",
  feedbackSaved: "Thanks",

  emptyState:
    "Choose a perspective above to start exploring.",
} as const;
