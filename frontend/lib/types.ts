export type Figure = {
  id: number;
  slug: string;
  display_name: string;
  full_name?: string | null;
  birth_year?: number | null;
  death_year?: number | null;
  short_description?: string | null;
  is_active: boolean;
};

export type FiguresResponse = {
  figures: Figure[];
};

export type SourceMetadata = {
  source_title?: string;
  source_key?: string;
  source_type?: string;
  publication_date?: string;
  author?: string;
  [key: string]: unknown;
};

export type AnswerSource = {
  source_number: number;
  chunk_key: string;
  chunk_index: number;
  content: string;
  similarity: number;
  metadata: SourceMetadata;
};

export type AnswerResponse = {
  question: string;
  figure_slug: string;
  answer: string;
  model: string | null;
  sources: AnswerSource[];
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: AnswerSource[];
};