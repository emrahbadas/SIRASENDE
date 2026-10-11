import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, type Library } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/config";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function LibraryScreen() {
  const { session } = useAuth();
  const signedIn = !!session;
  const [library, setLibrary] = useState<Library | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!signedIn) return;
    try {
      setLibrary(await api.library());
      setError(null);
    } catch {
      setError("Listen yüklenemedi");
    }
  }, [signedIn]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!signedIn) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]}>
        <Text style={styles.emptyTitle}>Listen burada</Text>
        <Text style={styles.emptyText}>Dizileri listene eklemek ve izleme geçmişini görmek için giriş yap.</Text>
        <Pressable style={styles.button} onPress={() => router.push("/login")}>
          <Text style={styles.buttonText}>Giriş yap</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
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
        <Text style={styles.title}>Listem</Text>
        {error && <Text style={styles.error}>{error}</Text>}
        {!library && !error && <ActivityIndicator color={colors.muted} style={{ marginTop: 32 }} />}

        {library && (
          <>
            {library.watchlist.length === 0 ? (
              <Text style={styles.muted}>Henüz listene dizi eklemedin. Dizi sayfasında “Listeme ekle”ye dokun.</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                {library.watchlist.map((s) => (
                  <Pressable
                    key={s.id}
                    style={{ width: 110 }}
                    onPress={() => router.push({ pathname: "/series/[id]", params: { id: s.id } })}
                  >
                    <View style={styles.poster}>
                      {s.poster && <Image source={{ uri: s.poster }} style={StyleSheet.absoluteFill} contentFit="cover" />}
                    </View>
                    <Text style={styles.cardTitle} numberOfLines={2}>
                      {s.title}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <Text style={styles.section}>İzleme geçmişi</Text>
            {library.history.length === 0 ? (
              <Text style={styles.muted}>İzlediğin bölümler burada görünecek.</Text>
            ) : (
              library.history.map((h) => {
                const pct = h.durationSeconds ? Math.min(1, h.position / h.durationSeconds) : 0;
                return (
                  <Pressable
                    key={h.episodeId}
                    style={styles.historyRow}
                    onPress={() =>
                      router.push({ pathname: "/watch/[seriesId]", params: { seriesId: h.seriesId, episode: h.episodeId } })
                    }
                  >
                    <View style={styles.thumb}>
                      {h.poster && <Image source={{ uri: h.poster }} style={StyleSheet.absoluteFill} contentFit="cover" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.historyTitle} numberOfLines={1}>
                        {h.seriesTitle}
                      </Text>
                      <Text style={styles.historyMeta} numberOfLines={1}>
                        Bölüm {h.episodeNumber} · {h.episodeTitle}
                      </Text>
                      <Text style={styles.historyMeta}>
                        {h.completed ? "İzlendi" : `${fmt(h.position)}${h.durationSeconds ? ` / ${fmt(h.durationSeconds)}` : ""}`}
                      </Text>
                      <View style={styles.bar}>
                        <View style={[styles.barFill, { width: `${(h.completed ? 1 : pct) * 100}%` }]} />
                      </View>
                    </View>
                  </Pressable>
                );
              })
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { alignItems: "center", justifyContent: "center", padding: 32 },
  content: { padding: 16, paddingBottom: 40, alignSelf: "center", width: "100%", maxWidth: 720 },
  title: { color: colors.text, fontSize: 22, fontWeight: "800", marginBottom: 16 },
  section: { color: colors.text, fontSize: 17, fontWeight: "700", marginTop: 28, marginBottom: 12 },
  poster: { width: 110, height: 158, borderRadius: 10, overflow: "hidden", backgroundColor: colors.surface },
  cardTitle: { color: colors.text, fontSize: 12, marginTop: 6 },
  historyRow: { flexDirection: "row", gap: 12, paddingVertical: 10, alignItems: "center" },
  thumb: { width: 56, height: 80, borderRadius: 8, overflow: "hidden", backgroundColor: colors.surface },
  historyTitle: { color: colors.text, fontSize: 15, fontWeight: "600" },
  historyMeta: { color: colors.faint, fontSize: 12, marginTop: 2 },
  bar: { height: 3, backgroundColor: colors.border, borderRadius: 2, marginTop: 6, overflow: "hidden" },
  barFill: { height: 3, backgroundColor: colors.accent },
  muted: { color: colors.faint },
  error: { color: "#fb7185", marginBottom: 12 },
  emptyTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  emptyText: { color: colors.muted, textAlign: "center", marginTop: 8 },
  button: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 28, marginTop: 20 },
  buttonText: { color: "#fff", fontWeight: "700" },
});
