// Display names for enum values stored in the database

export const PRODUCTION_TYPES = {
  human: "Gerçek çekim",
  ai_assisted: "Yapay zekâ destekli",
  ai_generated: "Yapay zekâ",
  hybrid: "Karma (çekim + yapay zekâ)",
} as const;

export const productionTypeLabel = (v?: string | null) =>
  (v && PRODUCTION_TYPES[v as keyof typeof PRODUCTION_TYPES]) || v || "";
