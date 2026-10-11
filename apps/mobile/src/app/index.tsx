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
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SeriesCard } from "@/components/series-card";
import { api, type CatalogSeries } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/config";
import { continueWatching, type LocalProgress } from "@/lib/progress";
import { supabase } from "@/lib/supabase";

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

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.logo}>
          <Text style={{ color: colors.accent }}>Sıra</Text> Sende
        </Text>
        {session ? (
          <Pressable onPress={() => supabase.auth.signOut()}>
            <Text style={styles.headerLink}>Çıkış</Text>
          </Pressable>
        ) : (
          <Link href="/login" style={styles.headerLink}>
            Giriş yap
          </Link>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
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
        {resumable.length > 0 && (
          <View style={styles.section}>
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
          <Text style={styles.sectionTitle}>Keşfet</Text>
          {error ? (
            <Text style={styles.error}>{error}</Text>
          ) : !series ? (
            <ActivityIndicator color={colors.muted} style={{ marginTop: 32 }} />
          ) : series.length === 0 ? (
            <Text style={styles.empty}>Henüz yayında dizi yok.</Text>
          ) : (
            <View style={styles.grid}>
              {series.map((s) => (
                <SeriesCard key={s.id} series={s} width={cardWidth} />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
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
