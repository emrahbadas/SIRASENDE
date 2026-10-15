import Ionicons from "@expo/vector-icons/Ionicons";
import { Image } from "expo-image";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EpisodeGrid } from "@/components/episode-grid";
import type { SeriesDetail, SeriesEpisode } from "@/lib/api";
import { colors } from "@/lib/config";

const TABS = [
  { key: "episodes", label: "Bölümler" },
  { key: "summary", label: "Özet" },
] as const;

/** Bottom sheet over the player: jump to any episode, or read the series summary. */
export function EpisodeSheet({
  visible,
  onClose,
  series,
  episodes,
  currentId,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  series: SeriesDetail;
  episodes: SeriesEpisode[];
  currentId?: string;
  onSelect: (index: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("episodes");
  const current = episodes.find((e) => e.id === currentId);
  const watched = episodes.filter((e) => e.progress?.completed).length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <View style={styles.poster}>
            {series.poster && <Image source={{ uri: series.poster }} style={StyleSheet.absoluteFill} contentFit="cover" />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={2}>
              {series.title}
            </Text>
            <Text style={styles.meta}>
              {current ? `Bölüm ${current.episodeNumber} · ` : ""}
              {episodes.length} bölüm · {watched} izlendi
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={10} style={styles.close}>
            <Ionicons name="close" size={20} color={colors.muted} />
          </Pressable>
        </View>

        <View style={styles.tabs}>
          {TABS.map((t) => (
            <Pressable key={t.key} onPress={() => setTab(t.key)} style={styles.tab} hitSlop={6}>
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
              {tab === t.key && <View style={styles.tabLine} />}
            </Pressable>
          ))}
        </View>

        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 8 }}>
          {tab === "episodes" ? (
            <EpisodeGrid
              episodes={episodes}
              currentId={currentId}
              onSelect={(_, index) => {
                onClose();
                onSelect(index);
              }}
            />
          ) : (
            <View>
              {series.creator && <Text style={styles.creator}>{series.creator.name}</Text>}
              <Text style={styles.summary}>{series.description || "Bu dizi için özet eklenmemiş."}</Text>
              {current && (
                <Text style={styles.episodeLine}>
                  Şu an: Bölüm {current.episodeNumber} · {current.title}
                </Text>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    maxHeight: "72%",
    backgroundColor: "#121214",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 12 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  poster: { width: 48, height: 68, borderRadius: 8, overflow: "hidden", backgroundColor: colors.surface },
  title: { color: colors.text, fontSize: 17, fontWeight: "800" },
  meta: { color: colors.faint, fontSize: 12, marginTop: 4 },
  close: { alignSelf: "flex-start", padding: 4 },
  tabs: { flexDirection: "row", gap: 24, marginTop: 16, marginBottom: 14 },
  tab: { paddingBottom: 6 },
  tabText: { color: colors.faint, fontSize: 15, fontWeight: "700" },
  tabTextActive: { color: colors.text },
  tabLine: { position: "absolute", left: 0, right: 0, bottom: 0, height: 2, borderRadius: 1, backgroundColor: colors.accent },
  body: { flexGrow: 0 },
  creator: { color: colors.accent, fontWeight: "700", marginBottom: 8 },
  summary: { color: colors.muted, lineHeight: 21 },
  episodeLine: { color: colors.faint, fontSize: 12, marginTop: 14 },
});
