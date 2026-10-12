import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { claimDailyReward, dailyReward, wallet, type DailyReward, type Wallet } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/config";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("tr-TR", { day: "numeric", month: "long", timeZone: "Europe/Istanbul" });

export default function RewardsScreen() {
  const { session } = useAuth();
  const [w, setW] = useState<Wallet | null>(null);
  const [daily, setDaily] = useState<DailyReward | null>(null);
  const [claiming, setClaiming] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    const [nextWallet, nextDaily] = await Promise.all([wallet(), dailyReward()]);
    setW(nextWallet);
    setDaily(nextDaily);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function claim() {
    setClaiming(true);
    try {
      const r = await claimDailyReward();
      if (r.coins > 0) Alert.alert(`+${r.coins} bonus coin`, `Giriş serinin ${r.day}. günü. Yarın da gel, seri devam etsin!`);
      await load();
    } catch (e) {
      Alert.alert((e as Error).message);
    } finally {
      setClaiming(false);
    }
  }

  if (!session) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]}>
        <Ionicons name="gift" size={44} color={colors.coin} />
        <Text style={styles.heading}>Her gün gel, coin kazan</Text>
        <Text style={styles.muted}>Giriş serisi ödüllerini toplamak için giriş yap.</Text>
        <Pressable style={styles.primary} onPress={() => router.push("/login")}>
          <Text style={styles.primaryText}>Giriş yap</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const rewards = daily?.rewards ?? [];
  const weekTotal = rewards.reduce((a, b) => a + b, 0);

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Ödüller</Text>

        {/* Wallet */}
        <View style={styles.wallet}>
          <View style={styles.walletCol}>
            <Text style={styles.walletLabel}>Coin</Text>
            <Text style={styles.coins}>{w ? w.purchased : "–"}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.walletCol}>
            <Text style={styles.walletLabel}>Bonus coin</Text>
            <Text style={[styles.coins, { color: "#fdba74" }]}>{w ? w.bonus : "–"}</Text>
          </View>
        </View>
        {w && w.bonus > 0 && w.bonusExpiresAt && (
          <Text style={styles.expiry}>
            {w.bonusExpiring} bonus coin {fmtDate(w.bonusExpiresAt)} tarihinde sona eriyor
          </Text>
        )}

        {/* Login streak */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Günlük giriş serisi</Text>
            <Text style={styles.muted}>Haftada {weekTotal} coin</Text>
          </View>
          {!daily ? (
            <ActivityIndicator color={colors.muted} style={{ marginVertical: 20 }} />
          ) : (
            <>
              <View style={styles.days}>
                {rewards.map((coins, i) => {
                  const day = i + 1;
                  const done = daily.claimedToday ? day <= daily.todayDay : day < daily.todayDay;
                  const today = !daily.claimedToday && day === daily.todayDay;
                  return (
                    <View key={day} style={[styles.day, done && styles.dayDone, today && styles.dayToday]}>
                      <Text style={[styles.dayCoins, done && styles.dayCoinsDone]}>{done ? "✓" : `+${coins}`}</Text>
                      <Text style={styles.dayLabel}>{day === 7 ? "7. gün" : `${day}`}</Text>
                    </View>
                  );
                })}
              </View>
              <Pressable
                style={[styles.claim, (daily.claimedToday || claiming) && styles.claimDisabled]}
                onPress={claim}
                disabled={daily.claimedToday || claiming}
              >
                {claiming ? (
                  <ActivityIndicator color="#1c1206" />
                ) : (
                  <Text style={styles.claimText}>
                    {daily.claimedToday
                      ? "Bugünkü ödülü aldın · yarın tekrar gel"
                      : `Bugünkü ödülü al · +${rewards[daily.todayDay - 1] ?? 0} coin`}
                  </Text>
                )}
              </Pressable>
              <Text style={styles.hint}>Bir gün kaçırırsan seri 1. günden yeniden başlar. Gün 00:00’da yenilenir.</Text>
            </>
          )}
        </View>

        {/* How it works */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Bonus coin nasıl çalışır?</Text>
          <Rule icon="lock-open-outline" text="Kilitli bölümleri açarken önce bonus coinlerin kullanılır." />
          <Rule
            icon="calendar-outline"
            text={`Bonus coinle günde en fazla 2 bölüm açabilirsin${w ? ` (bugün ${w.bonusUnlocksLeft} kaldı)` : ""}.`}
          />
          <Rule icon="hourglass-outline" text="Bonus coinler 14 gün geçerlidir; satın aldığın coinlerin süresi dolmaz." />
          <Rule icon="play-circle-outline" text="Coinin yoksa kilitli bölümleri 2 kısa reklam izleyerek de açabilirsin." />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Rule({ icon, text }: { icon: React.ComponentProps<typeof Ionicons>["name"]; text: string }) {
  return (
    <View style={styles.rule}>
      <Ionicons name={icon} size={18} color={colors.coin} />
      <Text style={styles.ruleText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  content: { padding: 16, paddingBottom: 40, alignSelf: "center", width: "100%", maxWidth: 720 },
  title: { color: colors.text, fontSize: 22, fontWeight: "800" },
  heading: { color: colors.text, fontSize: 18, fontWeight: "800" },
  muted: { color: colors.faint, fontSize: 13, textAlign: "center" },
  wallet: {
    flexDirection: "row",
    marginTop: 16,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: "#1c1206",
    borderColor: "rgba(245,158,11,0.35)",
    borderWidth: 1,
  },
  walletCol: { flex: 1, alignItems: "center" },
  walletLabel: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  coins: { color: colors.coin, fontSize: 28, fontWeight: "800", marginTop: 2 },
  divider: { width: 1, backgroundColor: "rgba(245,158,11,0.25)" },
  expiry: { color: colors.faint, fontSize: 12, marginTop: 6, textAlign: "center" },
  card: {
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    gap: 12,
  },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  days: { flexDirection: "row", gap: 6 },
  day: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
  },
  dayDone: { backgroundColor: "rgba(245,158,11,0.15)", borderColor: "rgba(245,158,11,0.4)" },
  dayToday: { borderColor: colors.coin, borderWidth: 2 },
  dayCoins: { color: colors.text, fontWeight: "800", fontSize: 13 },
  dayCoinsDone: { color: colors.coin },
  dayLabel: { color: colors.faint, fontSize: 10, marginTop: 2 },
  claim: { backgroundColor: colors.coin, borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  claimDisabled: { opacity: 0.45 },
  claimText: { color: "#1c1206", fontWeight: "800" },
  hint: { color: colors.faint, fontSize: 11, textAlign: "center" },
  rule: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  ruleText: { color: colors.muted, fontSize: 13, lineHeight: 19, flex: 1 },
  primary: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 32, marginTop: 8 },
  primaryText: { color: "#fff", fontWeight: "700" },
});
