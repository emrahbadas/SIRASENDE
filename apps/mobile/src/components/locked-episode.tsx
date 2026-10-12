import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { adsAvailable, showRewardedAd } from "@/lib/ads";
import { coinBalance, unlockWithAd, unlockWithCoins } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/config";

/** Shown instead of the player for a locked episode: watch an ad or spend coins. */
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
  const [busy, setBusy] = useState<"ad" | "coins" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    coinBalance().then(setBalance);
  }, [session?.user.id]);

  async function run(kind: "ad" | "coins", action: () => Promise<void>) {
    if (!session) return router.push("/login");
    setBusy(kind);
    setError(null);
    try {
      await action();
      onUnlocked();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const watchAd = () =>
    run("ad", async () => {
      const result = await showRewardedAd({ userId: session!.user.id, episodeId });
      if (result === "dismissed") throw new Error("Bölümü açmak için reklamı sonuna kadar izlemelisin");
      if (result === "unavailable") throw new Error("Şu an reklam yok, birazdan tekrar dene");
      await unlockWithAd(episodeId);
    });

  return (
    <View style={styles.wrap}>
      <Text style={styles.lock}>🔒</Text>
      <Text style={styles.title}>Bu bölüm kilitli</Text>
      <Text style={styles.text}>
        {adsAvailable ? `Kısa bir reklam izle ya da ${price} coin ile hemen aç.` : `${price} coin ile hemen aç.`}
      </Text>

      {!session ? (
        <Pressable style={styles.button} onPress={() => router.push("/login")}>
          <Text style={styles.buttonText}>Açmak için giriş yap</Text>
        </Pressable>
      ) : (
        <>
          {adsAvailable && (
            <Pressable style={styles.button} onPress={watchAd} disabled={!!busy}>
              {busy === "ad" ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={styles.row}>
                  <Ionicons name="play-circle" size={18} color="#fff" />
                  <Text style={styles.buttonText}>Reklam izle, ücretsiz aç</Text>
                </View>
              )}
            </Pressable>
          )}
          <Pressable
            style={[styles.button, adsAvailable && styles.secondary]}
            onPress={() => run("coins", () => unlockWithCoins(episodeId))}
            disabled={!!busy}
          >
            {busy === "coins" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{price} coin ile aç</Text>
            )}
          </Pressable>
          {balance !== null && <Text style={styles.balance}>Bakiyen: {balance} coin</Text>}
        </>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: "rgba(9,9,11,0.92)" },
  lock: { fontSize: 40 },
  title: { color: colors.text, fontSize: 20, fontWeight: "800", marginTop: 12 },
  text: { color: colors.muted, textAlign: "center", marginTop: 8 },
  button: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 28, marginTop: 14, minWidth: 240, alignItems: "center" },
  secondary: { backgroundColor: "transparent", borderColor: colors.coin, borderWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  balance: { color: colors.coin, marginTop: 12 },
  error: { color: "#fb7185", marginTop: 10, textAlign: "center" },
});
