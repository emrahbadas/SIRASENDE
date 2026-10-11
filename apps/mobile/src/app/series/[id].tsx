import { Image } from "expo-image";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, type SeriesDetail } from "@/lib/api";
import { colors } from "@/lib/config";

const warningLabels: Record<string, string> = {
  violence: "Şiddet",
  fear: "Korku",
  profanity: "Argo/Küfür",
  sensitive_themes: "Hassas temalar",
  substance_use: "Madde kullanımı",
};

const fmt = (s: number | null) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "");

export default function SeriesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [series, setSeries] = useState<SeriesDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api.series(id).then(setSeries, () => setError("Dizi yüklenemedi"));
    }, [id])
  );

  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!series) return <ActivityIndicator color={colors.muted} style={{ marginTop: 48 }} />;

  // Resume where the viewer left off, otherwise start from episode 1
  const resume = series.episodes.find((e) => e.progress && !e.progress.completed) ?? series.episodes[0];
  const watch = (episodeId: string) =>
    router.push({ pathname: "/watch/[seriesId]", params: { seriesId: series.id, episode: episodeId } });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: series.title }} />
      <View style={styles.header}>
        <View style={styles.poster}>
          {series.poster && <Image source={{ uri: series.poster }} style={StyleSheet.absoluteFill} contentFit="cover" />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{series.title}</Text>
          {series.creatorName && <Text style={styles.creator}>{series.creatorName}</Text>}
          <View style={styles.tags}>
            {series.ageRating && <Text style={styles.age}>{series.ageRating}</Text>}
            {series.contentWarnings.map((w) => (
              <Text key={w} style={styles.tag}>
                {warningLabels[w] ?? w}
              </Text>
            ))}
          </View>
        </View>
      </View>

      {series.description && <Text style={styles.description}>{series.description}</Text>}

      {resume && (
        <Pressable style={styles.play} onPress={() => watch(resume.id)}>
          <Text style={styles.playText}>
            {resume.progress ? `▶ Devam et · Bölüm ${resume.episodeNumber}` : "▶ 1. bölümden izle"}
          </Text>
        </Pressable>
      )}

      <Text style={styles.sectionTitle}>{series.episodes.length} bölüm</Text>
      {series.episodes.map((e) => (
        <Pressable key={e.id} style={styles.episode} onPress={() => watch(e.id)}>
          <Text style={styles.episodeNumber}>{e.episodeNumber}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.episodeTitle} numberOfLines={1}>
              {e.title}
            </Text>
            <Text style={styles.episodeMeta}>
              {fmt(e.durationSeconds)}
              {e.progress?.completed ? " · izlendi" : ""}
            </Text>
          </View>
          <Text
            style={[
              styles.access,
              { color: e.access === "locked" ? colors.coin : e.access === "unlocked" ? colors.success : colors.muted },
            ]}
          >
            {e.access === "locked" ? `🔒 ${series.episodeCoinPrice}` : e.access === "unlocked" ? "Açık" : "Ücretsiz"}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 48, alignSelf: "center", width: "100%", maxWidth: 720 },
  header: { flexDirection: "row", gap: 16 },
  poster: { width: 110, height: 160, borderRadius: 10, overflow: "hidden", backgroundColor: colors.surface },
  title: { color: colors.text, fontSize: 22, fontWeight: "800" },
  creator: { color: colors.accent, marginTop: 4 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  age: {
    color: "#fbbf24",
    borderColor: "#b45309",
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    fontSize: 11,
    fontWeight: "700",
  },
  tag: { color: colors.muted, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, fontSize: 11 },
  description: { color: colors.muted, marginTop: 16, lineHeight: 20 },
  play: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 20 },
  playText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "700", marginTop: 28, marginBottom: 8 },
  episode: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  episodeNumber: { color: colors.faint, width: 24, textAlign: "center", fontVariant: ["tabular-nums"] },
  episodeTitle: { color: colors.text, fontSize: 15 },
  episodeMeta: { color: colors.faint, fontSize: 12, marginTop: 2 },
  access: { fontSize: 12, fontWeight: "600" },
  error: { color: "#fb7185", margin: 24 },
});
