import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { colors, config } from "@/lib/config";
import { supabase } from "@/lib/supabase";

const DISMISSED_KEY = "creator-cta-dismissed";

/**
 * Compact reminder that Sıra Sende is not only for watching: viewers can
 * publish their own series. Dismissible; the choice is remembered per device.
 */
export function CreatorCta() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [isCreator, setIsCreator] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((v) => setDismissed(v === "1"))
      .catch(() => setDismissed(false));
  }, []);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("creator_profiles")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle()
      .then(({ data }) => setIsCreator(!!data));
  }, [userId]);

  // Wait for storage so a dismissed card never flashes; signed-out viewers are never creators
  if (dismissed !== false) return null;
  const creator = !!userId && isCreator;

  function dismiss() {
    setDismissed(true);
    AsyncStorage.setItem(DISMISSED_KEY, "1").catch(() => undefined);
  }

  return (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        <Text style={styles.eyebrow}>İzledin. Şimdi sıra sende.</Text>
        <Text style={styles.text}>
          {creator
            ? "Yeni bölümün hazır mı? Studio’da yükle, izleyicilerine ulaşsın."
            : "Kendi dikey dizini çek, yükle ve izlendikçe kazan."}
        </Text>
        <Pressable
          style={styles.cta}
          onPress={() => WebBrowser.openBrowserAsync(`${config.apiUrl}${creator ? "/studio" : "/onboarding"}`)}
          hitSlop={6}
        >
          <Text style={styles.ctaText}>{creator ? "Studio’yu aç" : "Creator ol"}</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.accent} />
        </Pressable>
      </View>
      <Pressable onPress={dismiss} hitSlop={10} accessibilityLabel="Kapat">
        <Ionicons name="close" size={18} color={colors.faint} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    gap: 12,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderLeftColor: colors.accent,
    borderLeftWidth: 3,
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
    marginBottom: 8,
  },
  eyebrow: { color: colors.text, fontSize: 15, fontWeight: "800" },
  text: { color: colors.muted, fontSize: 13, marginTop: 4, lineHeight: 18 },
  cta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8, alignSelf: "flex-start" },
  ctaText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
});
