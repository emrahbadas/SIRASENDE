import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ViewToken,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EpisodePlayer } from "@/components/episode-player";
import { api, type CatalogSeries } from "@/lib/api";
import { colors } from "@/lib/config";
import { saveProgress } from "@/lib/progress";
import { formatViews } from "@/lib/ranking";

type Short = CatalogSeries & { firstEpisodeId: string };

// Fisher–Yates: a different order every visit keeps discovery fresh
function shuffle<T>(list: T[]) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * "Kısa": a vertical feed of every series' first episode (always free). A
 * swipe moves to the next series; "Diziyi izle" continues with episode 2.
 */
export default function ShortsScreen() {
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<Short>>(null);
  const [items, setItems] = useState<Short[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const [focused, setFocused] = useState(false);

  // Play only while this tab is on screen; load the feed on first focus
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      if (!items) {
        api.catalog().then(
          (list) => setItems(shuffle(list.filter((s): s is Short => !!s.firstEpisodeId))),
          () => setError("Akış yüklenemedi. İnternet bağlantını kontrol et.")
        );
      }
      return () => setFocused(false);
    }, [items])
  );

  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken<Short>[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first?.index != null) setActive(first.index);
  }, []);

  const onLayout = (e: LayoutChangeEvent) => setPageHeight(e.nativeEvent.layout.height);

  if (error) return <Text style={styles.error}>{error}</Text>;

  return (
    <View style={styles.screen} onLayout={onLayout}>
      {!items || !pageHeight ? (
        <ActivityIndicator color={colors.muted} style={{ flex: 1 }} />
      ) : items.length === 0 ? (
        <Text style={styles.empty}>Henüz yayında dizi yok.</Text>
      ) : (
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(s) => s.id}
          pagingEnabled
          snapToInterval={pageHeight}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: pageHeight, offset: pageHeight * index, index })}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          windowSize={3}
          renderItem={({ item, index }) => (
            <View style={{ height: pageHeight, backgroundColor: "#000" }}>
              {focused && index === active && (
                <EpisodePlayer
                  key={item.firstEpisodeId}
                  episodeId={item.firstEpisodeId}
                  onLocked={() => undefined}
                  onProgress={(seconds, completed) =>
                    saveProgress({
                      seriesId: item.id,
                      episodeId: item.firstEpisodeId,
                      episodeNumber: 1,
                      seasonNumber: 1,
                      position: seconds,
                      completed,
                    })
                  }
                  onEnded={() => {
                    if (index + 1 < items.length) listRef.current?.scrollToIndex({ index: index + 1, animated: true });
                  }}
                />
              )}

              <View style={[styles.caption, { paddingBottom: 18 }]}>
                <Pressable onPress={() => router.push({ pathname: "/series/[id]", params: { id: item.id } })}>
                  <Text style={styles.title}>{item.title}</Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {[item.creatorName, item.categories[0]?.name_tr, item.views > 0 && `${formatViews(item.views)} izlenme`]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </Pressable>
                {item.episodeCount > 1 && (
                  <Pressable
                    style={styles.cta}
                    onPress={() =>
                      router.push({
                        pathname: "/watch/[seriesId]",
                        params: { seriesId: item.id, episode: item.firstEpisodeId },
                      })
                    }
                  >
                    <Ionicons name="play" size={14} color="#fff" />
                    <Text style={styles.ctaText}>Diziyi izle · {item.episodeCount} bölüm</Text>
                    <Ionicons name="chevron-forward" size={14} color="#fff" />
                  </Pressable>
                )}
              </View>
            </View>
          )}
        />
      )}
      <Text style={[styles.header, { top: insets.top + 10 }]} pointerEvents="none">
        Kısa
      </Text>
    </View>
  );
}

const shadow = { textShadowColor: "#000", textShadowRadius: 6 } as const;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  header: { position: "absolute", left: 16, color: "#fff", fontSize: 18, fontWeight: "800", ...shadow },
  caption: { position: "absolute", left: 16, right: 16, bottom: 0 },
  title: { color: "#fff", fontSize: 17, fontWeight: "800", ...shadow },
  meta: { color: "#e4e4e7", fontSize: 13, marginTop: 3, ...shadow },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginTop: 12,
  },
  ctaText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  empty: { color: colors.faint, textAlign: "center", marginTop: 120 },
  error: { color: "#fb7185", margin: 24, marginTop: 80 },
});
