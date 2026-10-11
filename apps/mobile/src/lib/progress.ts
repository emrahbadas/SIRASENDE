import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";

// "Continue watching": signed-in viewers sync to the server (save_watch_progress),
// everyone also keeps a local copy so it works signed out too.

const KEY = "continue-watching";
const MAX_LOCAL = 20;

export interface LocalProgress {
  seriesId: string;
  episodeId: string;
  episodeNumber: number;
  seasonNumber: number;
  position: number;
  completed: boolean;
  updatedAt: string;
}

async function readLocal(): Promise<LocalProgress[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? "[]");
  } catch {
    return [];
  }
}

export async function saveProgress(entry: Omit<LocalProgress, "updatedAt">) {
  const list = (await readLocal()).filter((p) => p.seriesId !== entry.seriesId);
  list.unshift({ ...entry, updatedAt: new Date().toISOString() });
  await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_LOCAL))).catch(() => undefined);

  const { data } = await supabase.auth.getSession();
  if (data.session) {
    await supabase
      .rpc("save_watch_progress", {
        p_episode_id: entry.episodeId,
        p_position_seconds: Math.floor(entry.position),
        p_completed: entry.completed,
      })
      .then(() => undefined, () => undefined);
  }
}

/** Latest episode per series, newest first (server when signed in, else local). */
export async function continueWatching(signedIn: boolean): Promise<LocalProgress[]> {
  if (signedIn) {
    const { data: rows } = await supabase.rpc("my_continue_watching", { p_limit: 10 });
    if (rows) {
      return (rows as Record<string, unknown>[]).map((r) => ({
        seriesId: r.series_id as string,
        episodeId: r.episode_id as string,
        episodeNumber: r.episode_number as number,
        seasonNumber: r.season_number as number,
        position: r.position_seconds as number,
        completed: r.completed as boolean,
        updatedAt: r.updated_at as string,
      }));
    }
  }
  return readLocal();
}
