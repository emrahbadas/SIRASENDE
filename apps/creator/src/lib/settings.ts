import type { SupabaseClient } from "@supabase/supabase-js";

export interface VideoSettings {
  maxEpisodeSeconds: number;
  splitTargetSeconds: number;
  maxSplitSourceSeconds: number;
}

const DEFAULTS: VideoSettings = {
  maxEpisodeSeconds: 180,
  splitTargetSeconds: 150,
  maxSplitSourceSeconds: 7200,
};

/** Reads video product settings from platform_settings (publicly readable). */
export async function getVideoSettings(supabase: SupabaseClient): Promise<VideoSettings> {
  const { data } = await supabase
    .from("platform_settings")
    .select("key, value")
    .in("key", ["max_episode_seconds", "split_target_seconds", "max_split_source_seconds"]);

  const map = new Map((data ?? []).map((r) => [r.key as string, Number(r.value)]));
  const pick = (key: string, fallback: number) => {
    const v = map.get(key);
    return v && Number.isFinite(v) && v > 0 ? v : fallback;
  };
  return {
    maxEpisodeSeconds: pick("max_episode_seconds", DEFAULTS.maxEpisodeSeconds),
    splitTargetSeconds: pick("split_target_seconds", DEFAULTS.splitTargetSeconds),
    maxSplitSourceSeconds: pick("max_split_source_seconds", DEFAULTS.maxSplitSourceSeconds),
  };
}
