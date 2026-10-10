export const PRODUCTION_TYPES = [
  "human",
  "ai_assisted",
  "ai_generated",
  "hybrid",
] as const;

export type ProductionType = (typeof PRODUCTION_TYPES)[number];

export const CONTENT_STATUSES = [
  "draft",
  "uploading",
  "processing",
  "transcribing",
  "translating",
  "moderating",
  "ready",
  "published",
  "blocked",
  "failed",
  "rejected",
  "needs_changes",
] as const;

export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const AGE_RATINGS = ["7+", "13+", "16+", "18+"] as const;
export type AgeRating = (typeof AGE_RATINGS)[number];

export const CONTENT_WARNINGS = [
  "violence",
  "fear",
  "profanity",
  "sensitive_themes",
  "substance_use",
] as const;
export type ContentWarning = (typeof CONTENT_WARNINGS)[number];

export const SCRIPT_SOURCES = ["human", "ai_assisted", "ai_generated"] as const;
export const VIDEO_SOURCES = ["real_footage", "ai_generated", "hybrid"] as const;
export const VOICE_SOURCES = ["human", "synthetic", "hybrid"] as const;
export const MUSIC_SOURCES = ["original", "licensed", "ai_generated"] as const;

export type ScriptSource = (typeof SCRIPT_SOURCES)[number];
export type VideoSource = (typeof VIDEO_SOURCES)[number];
export type VoiceSource = (typeof VOICE_SOURCES)[number];
export type MusicSource = (typeof MUSIC_SOURCES)[number];

export interface ProductionMetadata {
  script: ScriptSource | null;
  video: VideoSource | null;
  voice: VoiceSource | null;
  music: MusicSource | null;
}

export interface Production {
  id: string;
  creatorId: string;
  title: string;
  description: string | null;
  productionType: ProductionType;
  metadata: ProductionMetadata;
  createdAt: string;
  updatedAt: string;
}

export interface Series {
  id: string;
  productionId: string;
  title: string;
  description: string | null;
  posterUrl: string | null;
  primaryLanguage: string;
  status: ContentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Season {
  id: string;
  seriesId: string;
  seasonNumber: number;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Episode {
  id: string;
  seasonId: string;
  episodeNumber: number;
  title: string;
  description: string | null;
  durationSeconds: number | null;
  status: ContentStatus;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: string;
  slug: string;
  nameTr: string;
  nameEn: string;
}
