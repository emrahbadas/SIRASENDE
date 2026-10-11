import { useEvent, useEventListener } from "expo";
import { useVideoPlayer, VideoView, type VideoPlayer } from "expo-video";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ApiError, api } from "@/lib/api";
import { colors } from "@/lib/config";

const PROGRESS_INTERVAL_SECONDS = 5;
// Resuming a few seconds before the end would immediately trigger "ended"
const RESUME_END_MARGIN_SECONDS = 5;

// expo-video is configured by setting properties on the player object
function unmute(player: VideoPlayer) {
  player.muted = false;
}

/**
 * Plays one episode. Mounted only for the page on screen, so at most one
 * player decodes video at a time; unmounting releases it.
 */
export function EpisodePlayer({
  episodeId,
  onProgress,
  onEnded,
  onLocked,
}: {
  episodeId: string;
  onProgress: (seconds: number, completed: boolean) => void;
  onEnded: () => void;
  onLocked: () => void;
}) {
  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = PROGRESS_INTERVAL_SECONDS;
    // Browsers block autoplay with sound (the web build is a preview); start
    // muted there so playback really starts and the play state stays accurate
    if (Platform.OS === "web") p.muted = true;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  const { muted } = useEvent(player, "mutedChange", { muted: player.muted });

  // Each episode gets its own component instance (keyed by id), so the
  // initial loading/error state is already correct here.
  useEffect(() => {
    let cancelled = false;
    api
      .playback(episodeId)
      .then(async (pb) => {
        if (cancelled) return;
        await player.replaceAsync({ uri: pb.hlsUrl, contentType: "hls" });
        const duration = pb.durationSeconds ?? 0;
        if (pb.resumeAt > 0 && (!duration || pb.resumeAt < duration - RESUME_END_MARGIN_SECONDS)) {
          player.currentTime = pb.resumeAt;
        }
        player.play();
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.code === "locked") onLocked();
        else if (e instanceof ApiError && e.code === "video_not_ready") setError("Bu bölümün videosu henüz hazır değil");
        else setError("Video yüklenemedi");
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // onLocked is stable enough for this lifecycle; reload only per episode
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodeId, player]);

  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    if (currentTime > 0) onProgress(currentTime, false);
  });
  useEventListener(player, "playToEnd", () => {
    onProgress(player.duration || player.currentTime, true);
    onEnded();
  });

  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={() => (player.playing ? player.pause() : player.play())}>
      <VideoView player={player} style={styles.video} contentFit="cover" nativeControls={false} />
      {loading && <ActivityIndicator size="large" color={colors.text} style={styles.center} />}
      {error && <Text style={[styles.center, styles.error]}>{error}</Text>}
      {muted && (
        <Pressable style={styles.unmute} onPress={() => unmute(player)} hitSlop={8}>
          <Text style={styles.unmuteText}>🔇 Sesi aç</Text>
        </Pressable>
      )}
      {!loading && !error && !isPlaying && (
        <View style={[styles.center, styles.paused]}>
          <Text style={styles.pausedIcon}>▶</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Explicit size: a <video> on web does not stretch from insets alone
  video: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%" },
  center: { position: "absolute", alignSelf: "center", top: "48%" },
  error: { color: colors.text, backgroundColor: "rgba(0,0,0,0.6)", padding: 12, borderRadius: 8 },
  paused: { width: 72, height: 72, borderRadius: 36, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", marginTop: -36 },
  pausedIcon: { color: "#fff", fontSize: 30, marginLeft: 4 },
  unmute: { position: "absolute", right: 16, top: 64, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  unmuteText: { color: "#fff", fontSize: 13, fontWeight: "600" },
});
