import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { SeriesEpisode } from "@/lib/api";
import { colors } from "@/lib/config";

const PAGE = 30;
const COLUMNS = 6;

/**
 * Compact numbered tiles for jumping between episodes. Each tile shows its
 * state at a glance: playing now (orange), watched (✓), half-watched (a
 * progress line under the number) and locked (coin lock).
 */
export function EpisodeGrid({
  episodes,
  currentId,
  onSelect,
}: {
  episodes: SeriesEpisode[];
  currentId?: string;
  onSelect: (episode: SeriesEpisode, index: number) => void;
}) {
  const pages = Math.ceil(episodes.length / PAGE);
  const currentIndex = Math.max(0, episodes.findIndex((e) => e.id === currentId));
  const [page, setPage] = useState(Math.floor(currentIndex / PAGE));
  // Tile size from the measured width: COLUMNS per row with fixed gaps
  const [width, setWidth] = useState(0);
  const size = width ? Math.floor((width - GAP * (COLUMNS - 1)) / COLUMNS) : 0;
  const shown = episodes.slice(page * PAGE, page * PAGE + PAGE);

  return (
    <View>
      {pages > 1 && (
        <View style={styles.ranges}>
          {Array.from({ length: pages }, (_, p) => (
            <Pressable key={p} onPress={() => setPage(p)} style={[styles.range, p === page && styles.rangeActive]} hitSlop={4}>
              <Text style={[styles.rangeText, p === page && styles.rangeTextActive]}>
                {p * PAGE + 1}–{Math.min(episodes.length, (p + 1) * PAGE)}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.grid} onLayout={(ev) => setWidth(ev.nativeEvent.layout.width)}>
        {shown.map((e, i) => {
          const index = page * PAGE + i;
          const current = e.id === currentId;
          const watched = !!e.progress?.completed;
          const partial =
            !watched && e.progress && e.durationSeconds ? Math.min(1, e.progress.position / e.durationSeconds) : 0;
          return (
            <Pressable
              key={e.id}
              onPress={() => onSelect(e, index)}
              style={({ pressed }) => [
                styles.tile,
                { width: size, height: size },
                current && styles.tileCurrent,
                pressed && { opacity: 0.7 },
              ]}
              accessibilityLabel={`Bölüm ${e.episodeNumber}${e.access === "locked" ? ", kilitli" : ""}${watched ? ", izlendi" : ""}`}
            >
              {current ? (
                <Ionicons name="play" size={18} color="#fff" />
              ) : (
                <Text style={[styles.number, watched && styles.numberWatched]}>{e.episodeNumber}</Text>
              )}
              {e.access === "locked" && (
                <View style={styles.badge}>
                  <Ionicons name="lock-closed" size={9} color={colors.coin} />
                </View>
              )}
              {watched && !current && (
                <View style={styles.badge}>
                  <Ionicons name="checkmark" size={10} color={colors.success} />
                </View>
              )}
              {partial > 0 && (
                <View style={styles.partialTrack}>
                  <View style={[styles.partialFill, { width: `${Math.max(8, partial * 100)}%` }]} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.legend}>
        <Text style={styles.legendText}>
          <Ionicons name="lock-closed" size={10} color={colors.coin} /> kilitli ·{" "}
          <Ionicons name="checkmark" size={11} color={colors.success} /> izlendi · çizgi: yarım kaldı
        </Text>
      </View>
    </View>
  );
}

const GAP = 8;

const styles = StyleSheet.create({
  ranges: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  range: { borderColor: colors.border, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5 },
  rangeActive: { borderColor: colors.accent, backgroundColor: "rgba(234,88,12,0.12)" },
  rangeText: { color: colors.muted, fontSize: 12, fontWeight: "600", fontVariant: ["tabular-nums"] },
  rangeTextActive: { color: colors.accent },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  tile: {
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  tileCurrent: { backgroundColor: colors.accent, borderColor: colors.accent },
  number: { color: colors.text, fontSize: 16, fontWeight: "700", fontVariant: ["tabular-nums"] },
  numberWatched: { color: colors.faint },
  badge: { position: "absolute", top: 4, right: 4 },
  partialTrack: { position: "absolute", left: 8, right: 8, bottom: 6, height: 3, borderRadius: 2, backgroundColor: colors.border },
  partialFill: { height: 3, borderRadius: 2, backgroundColor: colors.accent },
  legend: { marginTop: 10 },
  legendText: { color: colors.faint, fontSize: 11 },
});
