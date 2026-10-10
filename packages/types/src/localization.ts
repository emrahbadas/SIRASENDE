export const SUBTITLE_LANGUAGES = ["tr", "en"] as const;

export type SubtitleLanguage = (typeof SUBTITLE_LANGUAGES)[number];

export const SUBTITLE_TRACK_STATUSES = [
  "pending",
  "generating",
  "generated",
  "edited",
  "published",
  "disabled",
  "failed",
] as const;

export type SubtitleTrackStatus = (typeof SUBTITLE_TRACK_STATUSES)[number];

export interface SubtitleTrack {
  id: string;
  episodeId: string;
  language: SubtitleLanguage;
  isOriginal: boolean;
  status: SubtitleTrackStatus;
  vttUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptionProvider {
  transcribe(input: { audioUrl: string; languageHint?: SubtitleLanguage }): Promise<{ jobId: string }>;
  getTranscriptStatus(jobId: string): Promise<"pending" | "done" | "failed">;
}

export interface TranslationProvider {
  translate(input: {
    text: string;
    sourceLanguage: SubtitleLanguage;
    targetLanguage: SubtitleLanguage;
  }): Promise<{ translatedText: string }>;
}
