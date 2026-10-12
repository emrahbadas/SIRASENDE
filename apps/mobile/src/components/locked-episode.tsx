import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { adsAvailable, showRewardedAd } from "@/lib/ads";
import { adUnlockStatus, coinBalance, reportRewardedAd, unlockWithCoins, type AdUnlockStatus } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/config";

/**
 * Shown instead of the player for a locked episode: watch rewarded ads
 * (N per episode, daily limit) or spend coins.
 */
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
  const [ad, setAd] = useState<AdUnlockStatus | null>(null);
  const [busy, setBusy] = useState<"ad" | "coins" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    coinBalance().then(setBalance);
    if (session && adsAvailable) adUnlockStatus(episodeId).then(setAd, () => setAd(null));
  }, [session, episodeId]);

  async function run(kind: "ad" | "coins", action: () => Promise<boolean>) {
    if (!session) return router.push("/login");
    setBusy(kind);
    setError(null);
    try {
      if (await action()) onUnlocked();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const watchAd = () =>
    run("ad", async () => {
      const before = ad ?? (await adUnlockStatus(episodeId));
      const result = await showRewardedAd({ userId: session!.user.id, episodeId });
      if (result === "dismissed") throw new Error("Reklamı sonuna kadar izlersen sayılır");
      if (result === "unavailable") throw new Error("Şu an reklam yok, birazdan tekrar dene");
      const next = await reportRewardedAd(episodeId, before);
      setAd(next);
      return next.unlocked;
    });

  const coins = () =>
    run("coins", async () => {
      await unlockWithCoins(episodeId);
      return true;
    });

  const limitReached = !!ad && ad.dailyRemaining === 0;
  const adsLeft = ad ? Math.max(ad.adsRequired - ad.adsWatched, 1) : 2;
  const resetTime = ad
    ? new Date(ad.resetsAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Istanbul" })
    : "00:00";

  return (
    <View style={styles.wrap}>
      <Text style={styles.lock}>🔒</Text>
      <Text style={styles.title}>Bu bölüm kilitli</Text>
      <Text style={styles.text}>
        {adsAvailable && !limitReached
          ? `${adsLeft} kısa reklam izle ya da ${price} coin ile hemen aç.`
          : `${price} coin ile hemen aç.`}
      </Text>

      {!session ? (
        <Pressable style={styles.button} onPress={() => router.push("/login")}>
          <Text style={styles.buttonText}>Açmak için giriş yap</Text>
        </Pressable>
      ) : (
        <>
          {adsAvailable && !limitReached && (
            <Pressable style={styles.button} onPress={watchAd} disabled={!!busy}>
              {busy === "ad" ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <View style={styles.row}>
                  <Ionicons name="play-circle" size={18} color="#fff" />
                  <Text style={styles.buttonText}>
                    {ad && ad.adsWatched > 0
                      ? `Reklam izle (${ad.adsWatched}/${ad.adsRequired})`
                      : adsLeft > 1
                        ? `${adsLeft} reklam izle, ücretsiz aç`
                        : "Reklam izle, ücretsiz aç"}
                  </Text>
                </View>
              )}
            </Pressable>
          )}
          {adsAvailable && ad && (
            <Text style={styles.quota}>
              {limitReached
                ? `Bugünkü reklam hakkın bitti · ${resetTime}'da yenilenir`
                : `Bugün reklamla ${ad.dailyRemaining} bölüm daha açabilirsin`}
            </Text>
          )}
          <Pressable
            style={[styles.button, adsAvailable && !limitReached && styles.secondary]}
            onPress={coins}
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
  quota: { color: colors.faint, fontSize: 12, marginTop: 8, textAlign: "center" },
  balance: { color: colors.coin, marginTop: 12 },
  error: { color: "#fb7185", marginTop: 10, textAlign: "center" },
});
