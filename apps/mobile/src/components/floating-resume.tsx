import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { colors } from "@/lib/config";
import type { LocalProgress } from "@/lib/progress";

const DISMISSED_KEY = "resume-card-dismissed";

/**
 * Small card floating above the tab bar with the most recent unfinished
 * episode. Closing it hides it until the viewer watches another episode.
 */
export function FloatingResume({
  progress,
  title,
  poster,
  visible,
}: {
  progress: LocalProgress | undefined;
  title: string | undefined;
  poster: string | null | undefined;
  visible: boolean;
}) {
  const [dismissed, setDismissed] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((v) => setDismissed(v))
      .catch(() => setDismissed(null));
  }, []);

  // Wait for storage so a dismissed card never flashes
  if (!visible || !progress || !title || dismissed === undefined || dismissed === progress.episodeId) return null;

  function dismiss() {
    setDismissed(progress!.episodeId);
    AsyncStorage.setItem(DISMISSED_KEY, progress!.episodeId).catch(() => undefined);
  }

  return (
    <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOutDown.duration(160)} style={styles.wrap}>
      <Pressable
        style={styles.card}
        onPress={() =>
          router.push({
            pathname: "/watch/[seriesId]",
            params: { seriesId: progress.seriesId, episode: progress.episodeId },
          })
        }
        accessibilityLabel={`${title}, bölüm ${progress.episodeNumber} izlemeye devam et`}
      >
        <View style={styles.poster}>
          {poster && <Image source={{ uri: poster }} style={StyleSheet.absoluteFill} contentFit="cover" />}
          <View style={styles.play}>
            <Ionicons name="play" size={14} color="#fff" />
          </View>
        </View>
        <View style={styles.body}>
          <Text style={styles.eyebrow}>Kaldığın yerden devam</Text>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.episode}>Bölüm {progress.episodeNumber}</Text>
        </View>
      </Pressable>
      <Pressable style={styles.close} onPress={dismiss} hitSlop={10} accessibilityLabel="Kapat">
        <Ionicons name="close" size={14} color={colors.muted} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", right: 12, bottom: 12 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: 230,
    padding: 8,
    paddingRight: 28,
    borderRadius: 14,
    backgroundColor: "rgba(24,24,27,0.96)",
    borderColor: colors.border,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  poster: { width: 40, height: 56, borderRadius: 6, overflow: "hidden", backgroundColor: colors.border, alignItems: "center", justifyContent: "center" },
  play: { width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(234,88,12,0.9)", alignItems: "center", justifyContent: "center" },
  body: { flex: 1 },
  eyebrow: { color: colors.accent, fontSize: 10, fontWeight: "700" },
  title: { color: colors.text, fontSize: 13, fontWeight: "700", marginTop: 1 },
  episode: { color: colors.muted, fontSize: 11, marginTop: 1 },
  close: { position: "absolute", top: 6, right: 6, padding: 2 },
});
