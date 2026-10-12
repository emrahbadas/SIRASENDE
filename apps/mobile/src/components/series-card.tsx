import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CatalogSeries } from "@/lib/api";
import { colors } from "@/lib/config";
import { formatViews, type Badge } from "@/lib/ranking";

const BADGE_COLORS: Record<Badge, string> = {
  İzliyorum: "#2563EB",
  Gündemde: colors.accent,
  Yeni: "#16A34A",
};

export function SeriesCard({
  series,
  width,
  badge,
  label,
}: {
  series: CatalogSeries;
  width: number;
  badge?: Badge;
  /** Shown under the poster instead of the genre, e.g. "No 1 · En çok izlenen" */
  label?: string | null;
}) {
  // Long press plays the first episode's short silent preview over the poster
  const [previewing, setPreviewing] = useState(false);

  return (
    <Link href={{ pathname: "/series/[id]", params: { id: series.id } }} asChild>
      <Pressable
        style={{ width }}
        delayLongPress={250}
        onLongPress={series.preview ? () => setPreviewing(true) : undefined}
        onPressOut={() => setPreviewing(false)}
      >
        <View style={[styles.poster, { width, height: width * (13 / 9) }]}>
          {series.poster ? (
            <Image source={{ uri: series.poster }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
          ) : (
            <Text style={styles.placeholder} numberOfLines={3}>
              {series.title}
            </Text>
          )}
          {previewing && series.preview && (
            <>
              <Image source={{ uri: series.preview }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <View style={styles.previewTag}>
                <Ionicons name="eye" size={10} color="#fff" />
                <Text style={styles.viewsText}>Önizleme</Text>
              </View>
            </>
          )}
          {!previewing && badge && <Text style={[styles.badge, { backgroundColor: BADGE_COLORS[badge] }]}>{badge}</Text>}
          {!previewing && series.ageRating && <Text style={styles.age}>{series.ageRating}</Text>}
          {!previewing && series.views > 0 && (
            <View style={styles.views}>
              <Ionicons name="play" size={10} color="#fff" />
              <Text style={styles.viewsText}>{formatViews(series.views)}</Text>
            </View>
          )}
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {series.title}
        </Text>
        {label ? (
          <Text style={styles.rank} numberOfLines={1}>
            {label}
          </Text>
        ) : (
          series.categories[0] && (
            <Text style={styles.tag} numberOfLines={1}>
              {series.categories[0].name_tr}
            </Text>
          )
        )}
      </Pressable>
    </Link>
  );
}

const chip = {
  position: "absolute",
  fontSize: 10,
  fontWeight: "700",
  paddingHorizontal: 5,
  paddingVertical: 1,
  borderRadius: 4,
  overflow: "hidden",
} as const;

const styles = StyleSheet.create({
  poster: {
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: { color: colors.faint, fontWeight: "700", textAlign: "center", paddingHorizontal: 8 },
  badge: { ...chip, top: 6, left: 6, color: "#fff" },
  age: { ...chip, top: 6, right: 6, color: "#fbbf24", backgroundColor: "rgba(0,0,0,0.6)" },
  views: {
    position: "absolute",
    left: 6,
    bottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  previewTag: {
    position: "absolute",
    left: 6,
    bottom: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(234,88,12,0.85)",
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  viewsText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  title: { color: colors.text, fontSize: 13, fontWeight: "600", marginTop: 6 },
  tag: { color: colors.faint, fontSize: 11, marginTop: 2 },
  rank: { color: colors.coin, fontSize: 11, fontWeight: "700", marginTop: 2 },
});
