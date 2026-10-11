import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, coinBalance, type Library } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/config";
import { setFollowing } from "@/lib/social";
import { supabase } from "@/lib/supabase";

export default function ProfileScreen() {
  const { session } = useAuth();
  const signedIn = !!session;
  const [balance, setBalance] = useState<number | null>(null);
  const [following, setFollowingList] = useState<Library["following"]>([]);

  const load = useCallback(async () => {
    if (!signedIn) return;
    const [coins, library] = await Promise.all([coinBalance(), api.library().catch(() => null)]);
    setBalance(coins);
    if (library) setFollowingList(library.following);
  }, [signedIn]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function unfollow(id: string) {
    try {
      await setFollowing(id, false);
      setFollowingList((list) => list.filter((c) => c.id !== id));
    } catch (e) {
      Alert.alert((e as Error).message);
    }
  }

  if (!signedIn) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]}>
        <Text style={styles.title}>Profil</Text>
        <Text style={styles.muted}>Coin bakiyeni, listeni ve takip ettiklerini görmek için giriş yap.</Text>
        <Pressable style={styles.button} onPress={() => router.push("/login")}>
          <Text style={styles.buttonText}>Giriş yap</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Profil</Text>
        <Text style={styles.email}>{session.user.email}</Text>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Cüzdanım</Text>
          <Text style={styles.coins}>
            {balance ?? "–"} <Text style={styles.coinUnit}>coin</Text>
          </Text>
          <Text style={styles.muted}>Coin satın alma ve ödüller yakında.</Text>
        </View>

        <Text style={styles.section}>Takip ettiklerim</Text>
        {following.length === 0 ? (
          <Text style={styles.muted}>Henüz kimseyi takip etmiyorsun. Dizi sayfasında creator’ı takip edebilirsin.</Text>
        ) : (
          following.map((c) => (
            <View key={c.id} style={styles.row}>
              <Text style={styles.rowText}>{c.name}</Text>
              <Pressable onPress={() => unfollow(c.id)} hitSlop={8}>
                <Text style={styles.unfollow}>Takibi bırak</Text>
              </Pressable>
            </View>
          ))
        )}

        <Pressable style={styles.signOut} onPress={() => supabase.auth.signOut()}>
          <Text style={styles.signOutText}>Çıkış yap</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { alignItems: "center", justifyContent: "center", padding: 32, gap: 8 },
  content: { padding: 16, paddingBottom: 40, alignSelf: "center", width: "100%", maxWidth: 720 },
  title: { color: colors.text, fontSize: 22, fontWeight: "800" },
  email: { color: colors.muted, marginTop: 4 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 16, marginTop: 20, gap: 6 },
  cardLabel: { color: colors.text, fontWeight: "700" },
  coins: { color: colors.coin, fontSize: 30, fontWeight: "800" },
  coinUnit: { fontSize: 15, color: colors.muted, fontWeight: "600" },
  section: { color: colors.text, fontSize: 17, fontWeight: "700", marginTop: 28, marginBottom: 8 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { color: colors.text, fontSize: 15 },
  unfollow: { color: colors.faint, fontSize: 13 },
  muted: { color: colors.faint, textAlign: "left" },
  button: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 28, marginTop: 12 },
  buttonText: { color: "#fff", fontWeight: "700" },
  signOut: { marginTop: 40, alignSelf: "center", padding: 12 },
  signOutText: { color: "#fb7185", fontWeight: "600" },
});
