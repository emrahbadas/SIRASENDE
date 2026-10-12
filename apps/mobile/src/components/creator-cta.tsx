import Ionicons from "@expo/vector-icons/Ionicons";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useAuth } from "@/lib/auth";
import { colors, config } from "@/lib/config";
import { supabase } from "@/lib/supabase";

/**
 * Permanent reminder of what makes Sıra Sende different: viewers can publish
 * their own series. Creators get a shortcut to Studio instead.
 */
export function CreatorCta() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [isCreator, setIsCreator] = useState(false);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("creator_profiles")
      .select("id")
      .eq("profile_id", userId)
      .maybeSingle()
      .then(({ data }) => setIsCreator(!!data));
  }, [userId]);

  // Signed-out viewers are never creators
  const creator = !!userId && isCreator;

  return (
    <Pressable
      style={styles.card}
      onPress={() => WebBrowser.openBrowserAsync(`${config.apiUrl}${creator ? "/studio" : "/onboarding"}`)}
      accessibilityRole="link"
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.eyebrow}>İzledin. Şimdi sıra sende.</Text>
        <Text style={styles.text}>
          {creator
            ? "Yeni bölümün hazır mı? Studio’da yükle, izleyicilerine ulaşsın."
            : "Kısa dikey diziler — bölüm bölüm izle, hikâyeni üret, yayınla, kazan."}
        </Text>
        <View style={styles.cta}>
          <Text style={styles.ctaText}>{creator ? "Studio’yu aç" : "Creator ol"}</Text>
          <Ionicons name="arrow-forward" size={14} color={colors.accent} />
        </View>
      </View>
    </Pressable>
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
