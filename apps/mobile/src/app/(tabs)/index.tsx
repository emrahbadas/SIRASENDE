import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, Link, router } from "expo-router";
import { Image } from "expo-image";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SeriesCard } from "@/components/series-card";
import { CreatorCta } from "@/components/creator-cta";
import { FloatingResume } from "@/components/floating-resume";
import { api, type CatalogSeries } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/config";
import { continueWatching, type LocalProgress } from "@/lib/progress";
import { badgesFor, matchesSearch, rankLabel, SORT_TABS, sortSeries, type SortTab } from "@/lib/ranking";

const GAP = 12;
const PADDING = 16;

export default function HomeScreen() {
  const { session } = useAuth();
  const { width } = useWindowDimensions();
  const cardWidth = (Math.min(width, 720) - PADDING * 2 - GAP * 2) / 3;

  const [series, setSeries] = useState<CatalogSeries[] | null>(null);
  const [resume, setResume] = useState<LocalProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [tab, setTab] = useState<SortTab>("popular");
  const [query, setQuery] = useState("");
  // Bottom edge of the "continue watching" row; the floating card shows once it scrolls away
  const [rowBottom, setRowBottom] = useState<number | null>(null);
  const [pastRow, setPastRow] = useState(false);

  const signedIn = !!session;
  const load = useCallback(async () => {
    try {
      const [catalog, progress] = await Promise.all([api.catalog(), continueWatching(signedIn)]);
      setSeries(catalog);
      setResume(progress);
      setError(null);
    } catch {
      setError("Diziler yüklenemedi. İnternet bağlantını kontrol et.");
    }
  }, [signedIn]);

  // Reload on focus (back from the player) and on sign-in/out, since `load`
  // changes with `signedIn`
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const byId = new Map((series ?? []).map((s) => [s.id, s]));
  const resumable = resume.filter((p) => byId.has(p.seriesId));

  // Only categories that currently have a published series
  const categories = [
    ...new Map((series ?? []).flatMap((s) => s.categories).map((c) => [c.slug, c])).values(),
  ].sort((a, b) => a.name_tr.localeCompare(b.name_tr, "tr"));
  const shown = sortSeries(
    (series ?? []).filter(
      (s) => (!category || s.categories.some((c) => c.slug === category)) && matchesSearch(s, query)
    ),
    tab
  );
  const badges = badgesFor(series ?? [], new Set(resumable.map((p) => p.seriesId)));
  const searching = query.trim().length > 0;

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.logo}>
          <Text style={{ color: colors.accent }}>Sıra</Text> Senin
        </Text>
        {!session && (
          <Link href="/login" style={styles.headerLink}>
            Giriş yap
          </Link>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        scrollEventThrottle={32}
        onScroll={(e) => {
          const past = rowBottom !== null && e.nativeEvent.contentOffset.y > rowBottom;
          if (past !== pastRow) setPastRow(past);
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.muted}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
        <View style={styles.search}>
          <Ionicons name="search" size={16} color={colors.faint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Dizi, creator veya tür ara"
            placeholderTextColor={colors.faint}
            style={styles.searchInput}
            returnKeyType="search"
            autoCorrect={false}
          />
          {searching && (
            <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityLabel="Aramayı temizle">
              <Ionicons name="close-circle" size={16} color={colors.faint} />
            </Pressable>
          )}
        </View>

        {!searching && <CreatorCta />}

        {!searching && resumable.length > 0 && (
          <View
            style={styles.section}
            onLayout={(e) => setRowBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
          >
            <Text style={styles.sectionTitle}>Kaldığın yerden devam et</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: GAP }}>
              {resumable.map((p) => {
                const s = byId.get(p.seriesId)!;
                return (
                  <Pressable
                    key={p.seriesId}
                    style={styles.resumeCard}
                    onPress={() =>
                      router.push({ pathname: "/watch/[seriesId]", params: { seriesId: p.seriesId, episode: p.episodeId } })
                    }
                  >
                    <View style={styles.resumePoster}>
                      {s.poster && <Image source={{ uri: s.poster }} style={StyleSheet.absoluteFill} contentFit="cover" />}
                      <Text style={styles.resumeBadge}>▶ Bölüm {p.episodeNumber}</Text>
                    </View>
                    <Text style={styles.resumeTitle} numberOfLines={1}>
                      {s.title}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.tabs}>
            {SORT_TABS.map((t) => (
              <Pressable key={t.key} onPress={() => setTab(t.key)} hitSlop={6}>
                <Text style={[styles.tab, tab === t.key && styles.tabActive]}>{t.label}</Text>
                {tab === t.key && <View style={styles.tabBar} />}
              </Pressable>
            ))}
          </View>
          {categories.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
              style={{ marginBottom: 14 }}
            >
              {[{ slug: null as string | null, name_tr: "Tümü" }, ...categories].map((c) => {
                const active = category === c.slug;
                return (
                  <Pressable
                    key={c.slug ?? "all"}
                    onPress={() => setCategory(c.slug)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.name_tr}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : !series ? (
            <ActivityIndicator color={colors.muted} style={{ marginTop: 32 }} />
          ) : shown.length === 0 ? (
            <Text style={styles.empty}>
              {series.length === 0
                ? "Henüz yayında dizi yok."
                : searching
                  ? `"${query.trim()}" için sonuç yok.`
                  : "Bu kategoride henüz dizi yok."}
            </Text>
          ) : (
            <View style={styles.grid}>
              {shown.map((s, i) => (
                <SeriesCard
                  key={s.id}
                  series={s}
                  width={cardWidth}
                  badge={badges.get(s.id)}
                  label={category || searching ? null : rankLabel(tab, i, s)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <FloatingResume
        visible={pastRow && !searching}
        progress={resumable[0]}
        title={resumable[0] ? byId.get(resumable[0].seriesId)?.title : undefined}
        poster={resumable[0] ? byId.get(resumable[0].seriesId)?.poster : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: PADDING,
    paddingVertical: 12,
  },
  logo: { color: colors.text, fontSize: 20, fontWeight: "800" },
  headerLink: { color: colors.muted, fontSize: 14 },
  content: { paddingHorizontal: PADDING, paddingBottom: 40, alignSelf: "center", width: "100%", maxWidth: 720 },
  section: { marginTop: 12 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: "700", marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 9 },
  tabs: { flexDirection: "row", gap: 20, marginBottom: 12 },
  tab: { color: colors.faint, fontSize: 16, fontWeight: "700", paddingBottom: 6 },
  tabActive: { color: colors.text },
  tabBar: { height: 3, borderRadius: 2, backgroundColor: colors.accent, marginTop: -3 },
  chips: { gap: 8 },
  chip: { borderColor: colors.border, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6 },
  chipActive: { borderColor: colors.accent, backgroundColor: "rgba(234,88,12,0.14)" },
  chipText: { color: colors.muted, fontSize: 13 },
  chipTextActive: { color: "#fdba74", fontWeight: "600" },
  resumeCard: { width: 112 },
  resumePoster: {
    width: 112,
    height: 160,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.surface,
    justifyContent: "flex-end",
  },
  resumeBadge: {
    color: colors.text,
    fontSize: 11,
    fontWeight: "700",
    backgroundColor: "rgba(0,0,0,0.65)",
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  resumeTitle: { color: colors.text, fontSize: 12, marginTop: 6 },
  error: { color: "#fb7185", marginTop: 16 },
  empty: { color: colors.faint, marginTop: 16 },
});
