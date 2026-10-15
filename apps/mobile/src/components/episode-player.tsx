import { useEvent, useEventListener } from "expo";
import { useVideoPlayer, VideoView, type VideoPlayer } from "expo-video";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ApiError, api } from "@/lib/api";
import { colors } from "@/lib/config";

const PROGRESS_INTERVAL_SECONDS = 5;
// Resuming a few seconds before the end would immediately trigger "ended"
const RESUME_END_MARGIN_SECONDS = 5;
// How often the on-screen progress bar reads the playhead
const BAR_REFRESH_MS = 250;

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// expo-video is configured by setting properties on the player object
function unmute(player: VideoPlayer) {
  player.muted = false;
}

function seek(player: VideoPlayer, seconds: number) {
  player.currentTime = seconds;
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
  const viewRef = useRef<VideoView>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // width / height of the source; decides between filling and letterboxing
  const [aspect, setAspect] = useState<number | null>(null);
  const { isPlaying } = useEvent(player, "playingChange", { isPlaying: player.playing });
  const { muted } = useEvent(player, "mutedChange", { muted: player.muted });
  const insets = useSafeAreaInsets();
  const [time, setTime] = useState({ current: 0, duration: 0 });
  const [barWidth, setBarWidth] = useState(0);
  // 0..1 while the viewer drags the progress bar
  const [scrub, setScrub] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setTime({ current: player.currentTime, duration: player.duration }), BAR_REFRESH_MS);
    return () => clearInterval(timer);
  }, [player]);

  // Each episode gets its own component instance (keyed by id), so the
  // initial loading/error state is already correct here.
  useEffect(() => {
    let cancelled = false;
    api
      .playback(episodeId)
      .then(async (pb) => {
        if (cancelled) return;
        if (pb.width && pb.height) setAspect(pb.width / pb.height);
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

  // Fallback when the API had no dimensions: read them from the loaded stream
  useEventListener(player, "sourceLoad", ({ availableVideoTracks }) => {
    const size = availableVideoTracks.find((t) => t.size.width > 0 && t.size.height > 0)?.size;
    if (size) setAspect((current) => current ?? size.width / size.height);
  });

  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    if (currentTime > 0) onProgress(currentTime, false);
  });
  useEventListener(player, "playToEnd", () => {
    // Some Android streams report "ended" right after loading (at 0s); only a
    // real end may mark the episode watched and move on to the next one
    const duration = player.duration;
    if (!(duration > 0) || player.currentTime < duration - 2) return;
    onProgress(duration, true);
    onEnded();
  });

  const ratioAt = (e: GestureResponderEvent) =>
    barWidth > 0 ? Math.min(1, Math.max(0, e.nativeEvent.locationX / barWidth)) : 0;

  // Vertical video fills the screen; horizontal video is shown whole
  // (letterboxed) instead of losing two thirds of the frame to cropping,
  // with a fullscreen button to watch it sideways.
  const landscape = aspect !== null && aspect > 1;

  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={() => (player.playing ? player.pause() : player.play())}>
      <VideoView
        ref={viewRef}
        player={player}
        style={styles.video}
        contentFit={landscape ? "contain" : "cover"}
        nativeControls={false}
        fullscreenOptions={{ enable: true }}
      />
      {loading && <ActivityIndicator size="large" color={colors.text} style={styles.center} />}
      {error && <Text style={[styles.center, styles.error]}>{error}</Text>}
      {muted && (
        <Pressable style={[styles.unmute, { top: insets.top + 52 }]} onPress={() => unmute(player)} hitSlop={8}>
          <Text style={styles.unmuteText}>🔇 Sesi aç</Text>
        </Pressable>
      )}
      {landscape && !loading && !error && (
        <Pressable
          style={[styles.fullscreen, { top: insets.top + (muted ? 92 : 52) }]}
          onPress={() => viewRef.current?.enterFullscreen()}
          hitSlop={8}
        >
          <Text style={styles.fullscreenText}>⤢ Tam ekran</Text>
        </Pressable>
      )}
      {!loading && !error && !isPlaying && (
        <View style={[styles.center, styles.paused]}>
          <Text style={styles.pausedIcon}>▶</Text>
        </View>
      )}
      {!loading && !error && time.duration > 0 && (
        // Always-visible progress bar; tap or drag to seek
        <View
          style={[styles.barArea, { bottom: insets.bottom + 4 }]}
          onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderGrant={(e) => setScrub(ratioAt(e))}
          onResponderMove={(e) => setScrub(ratioAt(e))}
          onResponderRelease={(e) => {
            const target = ratioAt(e) * time.duration;
            seek(player, target);
            setTime((t) => ({ ...t, current: target }));
            setScrub(null);
          }}
          accessibilityRole="adjustable"
          accessibilityLabel={`İlerleme ${fmt(time.current)} / ${fmt(time.duration)}`}
        >
          {scrub !== null && (
            <Text style={styles.scrubTime} pointerEvents="none">
              {fmt(scrub * time.duration)} / {fmt(time.duration)}
            </Text>
          )}
          <View style={[styles.track, scrub !== null && styles.trackActive]} pointerEvents="none">
            <View
              style={[
                styles.fill,
                { width: `${Math.min(100, ((scrub ?? time.current / time.duration) || 0) * 100)}%` },
              ]}
            />
          </View>
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
  // top comes from the safe area, below the episode counter
  unmute: { position: "absolute", right: 16, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  unmuteText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  // Top right, under "Sesi aç": the right rail below holds episodes / like / report
  fullscreen: { position: "absolute", right: 16, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  fullscreenText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  // Tall touch area, thin visible track
  barArea: { position: "absolute", left: 12, right: 12, height: 28, justifyContent: "flex-end", paddingBottom: 10 },
  track: { height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.25)", overflow: "hidden" },
  trackActive: { height: 6, borderRadius: 3 },
  fill: { height: "100%", backgroundColor: colors.accent },
  scrubTime: {
    position: "absolute",
    alignSelf: "center",
    bottom: 26,
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    textShadowColor: "#000",
    textShadowRadius: 6,
  },
});
