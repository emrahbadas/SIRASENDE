import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { router, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { EpisodeGrid } from "@/components/episode-grid";
import { ReportSheet } from "@/components/report-sheet";
import { api, type SeriesDetail } from "@/lib/api";
import { colors } from "@/lib/config";
import { setBlocked, setFollowing, setInWatchlist } from "@/lib/social";

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
  const [reporting, setReporting] = useState(false);
  const [layout, setLayout] = useState<"grid" | "list">("grid");

  useFocusEffect(
    useCallback(() => {
      api.series(id).then(setSeries, () => setError("Dizi yüklenemedi"));
    }, [id])
  );

  if (error) return <Text style={styles.error}>{error}</Text>;
  if (!series) return <ActivityIndicator color={colors.muted} style={{ marginTop: 48 }} />;

  // Optimistic toggles; revert if the server refuses
  async function toggleWatchlist() {
    const next = !series!.inWatchlist;
    setSeries((s) => s && { ...s, inWatchlist: next });
    try {
      if (!(await setInWatchlist(series!.id, next))) setSeries((s) => s && { ...s, inWatchlist: !next });
    } catch (e) {
      setSeries((s) => s && { ...s, inWatchlist: !next });
      Alert.alert((e as Error).message);
    }
  }

  async function toggleFollow() {
    const creator = series!.creator!;
    const next = !creator.following;
    const apply = (following: boolean) =>
      setSeries((s) =>
        s?.creator
          ? { ...s, creator: { ...s.creator, following, followers: s.creator.followers + (following ? 1 : -1) } }
          : s
      );
    apply(next);
    try {
      if (!(await setFollowing(creator.id, next))) apply(!next);
    } catch (e) {
      apply(!next);
      Alert.alert((e as Error).message);
    }
  }

  // Blocking hides the creator's series from the viewer's home and Shorts feed
  function toggleBlock() {
    const creator = series!.creator!;
    const apply = async (blocked: boolean) => {
      try {
        if (await setBlocked(creator.id, blocked)) {
          setSeries((s) => (s?.creator ? { ...s, creator: { ...s.creator, blocked } } : s));
          if (blocked) router.back();
        }
      } catch (e) {
        Alert.alert((e as Error).message);
      }
    };
    if (creator.blocked) return apply(false);
    Alert.alert(
      `${creator.name} engellensin mi?`,
      "Bu creator'ın dizileri artık ana sayfanda ve Kısa akışında görünmez. Profil → Ayarlar'dan engeli kaldırabilirsin.",
      [
        { text: "Vazgeç", style: "cancel" },
        { text: "Engelle", style: "destructive", onPress: () => apply(true) },
      ]
    );
  }

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
          {series.creator && (
            <View style={styles.creatorRow}>
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.creator} numberOfLines={1}>
                  {series.creator.name}
                </Text>
                <Text style={styles.followers}>{series.creator.followers} takipçi</Text>
              </View>
              <Pressable
                style={[styles.follow, series.creator.following && styles.followActive]}
                onPress={toggleFollow}
                hitSlop={6}
              >
                <Text style={[styles.followText, series.creator.following && styles.followTextActive]}>
                  {series.creator.following ? "Takip ediliyor" : "Takip et"}
                </Text>
              </Pressable>
            </View>
          )}
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

      <View style={styles.actions}>
        {resume && (
          <Pressable style={[styles.play, { flex: 1 }]} onPress={() => watch(resume.id)}>
            <Text style={styles.playText}>
              {resume.progress ? `▶ Devam et · Bölüm ${resume.episodeNumber}` : "▶ 1. bölümden izle"}
            </Text>
          </Pressable>
        )}
        <Pressable style={styles.listButton} onPress={toggleWatchlist}>
          <Text style={styles.listButtonText}>{series.inWatchlist ? "✓ Listemde" : "＋ Listeme ekle"}</Text>
        </Pressable>
      </View>

      <View style={styles.safety}>
        <Pressable style={styles.safetyButton} onPress={() => setReporting(true)} hitSlop={6}>
          <Ionicons name="flag-outline" size={15} color={colors.faint} />
          <Text style={styles.safetyText}>Bildir</Text>
        </Pressable>
        {series.creator && (
          <Pressable style={styles.safetyButton} onPress={toggleBlock} hitSlop={6}>
            <Ionicons name={series.creator.blocked ? "eye-outline" : "ban-outline"} size={15} color={colors.faint} />
            <Text style={styles.safetyText}>{series.creator.blocked ? "Engeli kaldır" : "Creator'ı engelle"}</Text>
          </Pressable>
        )}
      </View>
      <ReportSheet visible={reporting} onClose={() => setReporting(false)} seriesId={series.id} subject={series.title} />

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{series.episodes.length} bölüm</Text>
        <View style={styles.layoutToggle}>
          {(["grid", "list"] as const).map((l) => (
            <Pressable
              key={l}
              onPress={() => setLayout(l)}
              style={[styles.layoutButton, layout === l && styles.layoutButtonActive]}
              hitSlop={4}
              accessibilityLabel={l === "grid" ? "Kutu görünümü" : "Liste görünümü"}
            >
              <Ionicons name={l === "grid" ? "grid-outline" : "list-outline"} size={16} color={layout === l ? colors.text : colors.faint} />
            </Pressable>
          ))}
        </View>
      </View>
      {layout === "grid" && (
        <EpisodeGrid episodes={series.episodes} currentId={resume?.progress ? resume.id : undefined} onSelect={(e) => watch(e.id)} />
      )}
      {layout === "list" && series.episodes.map((e) => (
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
  creator: { color: colors.accent, fontWeight: "600" },
  creatorRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  followers: { color: colors.faint, fontSize: 11, marginTop: 1 },
  follow: { borderColor: colors.accent, borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  followActive: { borderColor: colors.border, backgroundColor: colors.surface },
  followText: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  followTextActive: { color: colors.muted },
  actions: { flexDirection: "row", gap: 10, marginTop: 20 },
  listButton: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  listButtonText: { color: colors.text, fontWeight: "600", fontSize: 13 },
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
  play: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 14, alignItems: "center" },
  playText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  safety: { flexDirection: "row", gap: 18, marginTop: 14 },
  safetyButton: { flexDirection: "row", alignItems: "center", gap: 5 },
  safetyText: { color: colors.faint, fontSize: 12 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 28, marginBottom: 12 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  layoutToggle: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: 8, padding: 2 },
  layoutButton: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  layoutButtonActive: { backgroundColor: colors.border },
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
