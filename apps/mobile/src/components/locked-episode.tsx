import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { coinBalance, unlockWithCoins } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/config";

/** Shown instead of the player for a locked episode. */
export function LockedEpisode({
  episodeId,
  price,
  onUnlocked,
}: {
  episodeId: string;
  price: number;
  onUnlocked: () => void;
}) {
  const { session } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    coinBalance().then(setBalance);
  }, [session?.user.id]);

  async function unlock() {
    if (!session) return router.push("/login");
    setBusy(true);
    setError(null);
    try {
      await unlockWithCoins(episodeId);
      onUnlocked();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.lock}>🔒</Text>
      <Text style={styles.title}>Bu bölüm kilitli</Text>
      <Text style={styles.text}>{price} coin ile hemen aç. Reklam izleyerek açma yakında.</Text>
      <Pressable style={styles.button} onPress={unlock} disabled={busy}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{session ? `${price} coin ile aç` : "Açmak için giriş yap"}</Text>
        )}
      </Pressable>
      {session && balance !== null && <Text style={styles.balance}>Bakiyen: {balance} coin</Text>}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: "rgba(9,9,11,0.92)" },
  lock: { fontSize: 40 },
  title: { color: colors.text, fontSize: 20, fontWeight: "800", marginTop: 12 },
  text: { color: colors.muted, textAlign: "center", marginTop: 8 },
  button: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 28, marginTop: 20, minWidth: 200, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  balance: { color: colors.coin, marginTop: 12 },
  error: { color: "#fb7185", marginTop: 10, textAlign: "center" },
});
