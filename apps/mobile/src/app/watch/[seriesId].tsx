import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EpisodePlayer } from "@/components/episode-player";
import { EpisodeSheet } from "@/components/episode-sheet";
import { LockedEpisode } from "@/components/locked-episode";
import { ReportSheet } from "@/components/report-sheet";
import { api, type SeriesDetail, type SeriesEpisode } from "@/lib/api";
import { colors } from "@/lib/config";
import { saveProgress } from "@/lib/progress";
import { setLiked } from "@/lib/social";

/** Vertical, swipeable episode feed for one series (TikTok-style). */
export default function WatchScreen() {
  const { seriesId, episode } = useLocalSearchParams<{ seriesId: string; episode?: string }>();
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<SeriesEpisode>>(null);

  const [series, setSeries] = useState<SeriesDetail | null>(null);
  const [episodes, setEpisodes] = useState<SeriesEpisode[]>([]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reporting, setReporting] = useState<SeriesEpisode | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    api.series(seriesId).then(
      (s) => {
        setSeries(s);
        setEpisodes(s.episodes);
        const start = Math.max(0, s.episodes.findIndex((e) => e.id === episode));
        setActive(start);
      },
      () => setError("Dizi yüklenemedi")
    );
  }, [seriesId, episode]);

  // FlatList requires this callback to stay the same for its lifetime
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken<SeriesEpisode>[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first?.index != null) setActive(first.index);
  }, []);

  // Keeps the episode grid's watched marks current while watching
  const markWatched = useCallback((episodeId: string, position: number) => {
    setEpisodes((list) => list.map((e) => (e.id === episodeId ? { ...e, progress: { position, completed: true } } : e)));
  }, []);

  // Runs after the episode sheet has closed; scrolling while it animates out is lost
  const jumpTo = useCallback((index: number) => {
    setActive(index);
    setTimeout(() => listRef.current?.scrollToIndex({ index, animated: false }), 60);
  }, []);

  const setAccess = useCallback((episodeId: string, access: SeriesEpisode["access"]) => {
    setEpisodes((list) => list.map((e) => (e.id === episodeId ? { ...e, access } : e)));
  }, []);

  // Optimistic like; reverted if the server refuses or the viewer must sign in
  const toggleLike = useCallback(async (episode: SeriesEpisode) => {
    const apply = (liked: boolean) =>
      setEpisodes((list) =>
        list.map((e) => (e.id === episode.id ? { ...e, liked, likes: Math.max(0, e.likes + (liked ? 1 : -1)) } : e))
      );
    const next = !episode.liked;
    apply(next);
    try {
      if (!(await setLiked(episode.id, next))) apply(!next);
    } catch {
      apply(!next);
    }
  }, []);

  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!series) return <ActivityIndicator color={colors.muted} style={{ flex: 1, backgroundColor: "#000" }} />;

  const startIndex = Math.max(0, episodes.findIndex((e) => e.id === episode));

  return (
    <View style={styles.screen}>
      <FlatList
        ref={listRef}
        data={episodes}
        keyExtractor={(e) => e.id}
        pagingEnabled
        snapToInterval={height}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        initialScrollIndex={startIndex}
        getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        windowSize={3}
        renderItem={({ item, index }) => (
          <View style={{ height, width, backgroundColor: "#000" }}>
            {index === active &&
              (item.access === "locked" ? (
                <LockedEpisode
                  episodeId={item.id}
                  price={series.episodeCoinPrice}
                  onUnlocked={() => setAccess(item.id, "unlocked")}
                />
              ) : (
                <EpisodePlayer
                  key={item.id}
                  episodeId={item.id}
                  onLocked={() => setAccess(item.id, "locked")}
                  onProgress={(seconds, completed) => {
                    if (completed) markWatched(item.id, seconds);
                    saveProgress({
                      seriesId: series.id,
                      episodeId: item.id,
                      episodeNumber: item.episodeNumber,
                      seasonNumber: item.seasonNumber,
                      position: seconds,
                      completed,
                    });
                  }}
                  onEnded={() => {
                    if (index + 1 < episodes.length) listRef.current?.scrollToIndex({ index: index + 1, animated: true });
                  }}
                />
              ))}

            <Pressable
              style={[styles.like, { bottom: insets.bottom + 252 }]}
              onPress={() => setPicking(true)}
              hitSlop={10}
              accessibilityLabel="Bölümler"
            >
              <Ionicons name="albums-outline" size={30} color="#fff" />
              <Text style={styles.likeCount}>Bölümler</Text>
            </Pressable>

            {item.access !== "locked" && (
              <Pressable
                style={[styles.like, { bottom: insets.bottom + 180 }]}
                onPress={() => toggleLike(item)}
                hitSlop={10}
              >
                <Ionicons name={item.liked ? "heart" : "heart-outline"} size={34} color={item.liked ? colors.accent : "#fff"} />
                <Text style={styles.likeCount}>{item.likes}</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.report, { bottom: insets.bottom + 128 }]}
              onPress={() => setReporting(item)}
              hitSlop={10}
              accessibilityLabel="Bölümü bildir"
            >
              <Ionicons name="flag-outline" size={24} color="#fff" />
            </Pressable>

            <View style={[styles.caption, { paddingBottom: insets.bottom + 40 }]} pointerEvents="none">
              <Text style={styles.seriesTitle}>{series.title}</Text>
              <Text style={styles.episodeTitle}>
                Bölüm {item.episodeNumber} · {item.title}
              </Text>
              {index === episodes.length - 1 && <Text style={styles.last}>Son bölüm</Text>}
            </View>
          </View>
        )}
      />

      <EpisodeSheet
        visible={picking}
        onClose={() => setPicking(false)}
        series={series}
        episodes={episodes}
        currentId={episodes[active]?.id}
        onSelect={jumpTo}
      />

      <ReportSheet
        visible={!!reporting}
        onClose={() => setReporting(null)}
        seriesId={series.id}
        episodeId={reporting?.id}
        subject={`${series.title} · Bölüm ${reporting?.episodeNumber ?? ""}`}
      />

      <Pressable style={[styles.back, { top: insets.top + 8 }]} onPress={() => router.back()} hitSlop={12}>
        <Text style={styles.backText}>‹</Text>
      </Pressable>
      <Pressable style={[styles.counterButton, { top: insets.top + 8 }]} onPress={() => setPicking(true)} hitSlop={8}>
        <Text style={styles.counter}>
          {active + 1} / {episodes.length}
        </Text>
        <Ionicons name="chevron-down" size={14} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  caption: { position: "absolute", left: 16, right: 80, bottom: 0 },
  like: { position: "absolute", right: 14, alignItems: "center" },
  report: { position: "absolute", right: 19, alignItems: "center", opacity: 0.85 },
  likeCount: { color: "#fff", fontSize: 12, fontWeight: "700", marginTop: 2, textShadowColor: "#000", textShadowRadius: 4 },
  seriesTitle: { color: colors.text, fontSize: 16, fontWeight: "800", textShadowColor: "#000", textShadowRadius: 6 },
  episodeTitle: { color: "#e4e4e7", fontSize: 14, marginTop: 4, textShadowColor: "#000", textShadowRadius: 6 },
  last: { color: colors.muted, fontSize: 12, marginTop: 6 },
  back: { position: "absolute", left: 12, width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" },
  backText: { color: "#fff", fontSize: 30, lineHeight: 32, marginTop: -2 },
  counterButton: {
    position: "absolute",
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  counter: { color: "#fff", fontWeight: "700", fontVariant: ["tabular-nums"] },
  error: { color: "#fb7185", margin: 24 },
});
