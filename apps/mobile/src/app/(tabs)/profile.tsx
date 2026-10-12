import Ionicons from "@expo/vector-icons/Ionicons";
import Constants from "expo-constants";
import { router, useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MenuRow, MenuSection } from "@/components/menu-row";
import { api, coinBalance } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { colors, config } from "@/lib/config";
import { supabase } from "@/lib/supabase";

type Profile = { username: string; display_name: string | null };
type Roles = { creator: boolean; admin: boolean; moderator: boolean; pending: number };

const version = Constants.expoConfig?.version ?? "";

export default function ProfileScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [counts, setCounts] = useState({ watched: 0, listed: 0, following: 0 });
  const [roles, setRoles] = useState<Roles>({ creator: false, admin: false, moderator: false, pending: 0 });

  const load = useCallback(async () => {
    if (!userId) return;
    const [coins, library, { data: me }, { data: myRoles }] = await Promise.all([
      coinBalance(),
      api.library().catch(() => null),
      supabase.from("profiles").select("username, display_name").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("profile_id", userId),
    ]);
    setBalance(coins);
    setProfile(me);
    if (library) {
      setCounts({ watched: library.history.length, listed: library.watchlist.length, following: library.following.length });
    }

    const names = (myRoles ?? []).map((r) => r.role as string);
    const staff = names.includes("admin") || names.includes("moderator");
    // Moderators can read series under review (RLS)
    const { count } = staff
      ? await supabase.from("series").select("id", { count: "exact", head: true }).eq("status", "moderating")
      : { count: 0 };
    setRoles({
      creator: names.includes("creator"),
      admin: names.includes("admin"),
      moderator: names.includes("moderator"),
      pending: count ?? 0,
    });
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Studio and moderation live on the web; open them in the in-app browser
  const openWeb = (path: string) => WebBrowser.openBrowserAsync(`${config.apiUrl}${path}`);

  if (!session) {
    return (
      <SafeAreaView style={[styles.screen, styles.centered]}>
        <View style={[styles.avatar, styles.avatarLarge]}>
          <Ionicons name="person" size={34} color={colors.muted} />
        </View>
        <Text style={styles.name}>Sıra Sende’ye katıl</Text>
        <Text style={styles.centerText}>
          Listeni, izleme geçmişini ve coin bakiyeni tüm cihazlarında görmek için giriş yap.
        </Text>
        <Pressable style={styles.primary} onPress={() => router.push("/login")}>
          <Text style={styles.primaryText}>Giriş yap</Text>
        </Pressable>
        <View style={{ alignSelf: "stretch", marginTop: 12 }}>
          <MenuSection>
            <MenuRow icon="help-circle-outline" label="Sık sorulan sorular" onPress={() => router.push("/faq")} last />
          </MenuSection>
        </View>
      </SafeAreaView>
    );
  }

  const name = profile?.display_name || profile?.username || session.user.email?.split("@")[0] || "";
  const chips = [roles.creator && "Creator", roles.admin ? "Admin" : roles.moderator && "Moderatör"].filter(
    Boolean
  ) as string[];

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* User card */}
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.initial}>{name.charAt(0).toLocaleUpperCase("tr")}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.handle} numberOfLines={1}>
              {profile ? `@${profile.username}` : session.user.email}
            </Text>
            {chips.length > 0 && (
              <View style={styles.chips}>
                {chips.map((c) => (
                  <Text key={c} style={styles.chip}>
                    {c}
                  </Text>
                ))}
              </View>
            )}
          </View>
          <Pressable onPress={() => router.push("/settings")} hitSlop={10} accessibilityLabel="Ayarlar">
            <Ionicons name="settings-outline" size={22} color={colors.muted} />
          </Pressable>
        </View>

        {/* Wallet */}
        <View style={styles.wallet}>
          <View style={{ flex: 1 }}>
            <Text style={styles.walletLabel}>Coin bakiyem</Text>
            <View style={styles.coinRow}>
              <Ionicons name="logo-bitcoin" size={22} color={colors.coin} />
              <Text style={styles.coins}>{balance ?? "–"}</Text>
            </View>
            <Text style={styles.walletHint}>Kilitli bölümleri reklam izleyerek de açabilirsin.</Text>
          </View>
          <Pressable
            style={styles.topUp}
            onPress={() => Alert.alert("Çok yakında", "Coin satın alma uygulama mağazaya çıktığında açılacak.")}
          >
            <Text style={styles.topUpText}>Şarj et</Text>
          </Pressable>
        </View>

        {/* Stats */}
        <View style={styles.stats}>
          <Stat value={counts.watched} label="İzlenen" onPress={() => router.push("/library")} />
          <Stat value={counts.listed} label="Listem" onPress={() => router.push("/library")} />
          <Stat value={counts.following} label="Takip" onPress={() => router.push("/following")} />
        </View>

        <MenuSection title="İzleme">
          <MenuRow icon="time-outline" label="Oynatma geçmişi" onPress={() => router.push("/library")} />
          <MenuRow icon="people-outline" label="Takip ettiklerim" onPress={() => router.push("/following")} last />
        </MenuSection>

        <MenuSection title="Creator">
          {roles.creator ? (
            <MenuRow icon="videocam-outline" label="Creator Studio" onPress={() => openWeb("/studio")} external last={!roles.admin && !roles.moderator} />
          ) : (
            <MenuRow
              icon="sparkles-outline"
              label="Creator ol — dizini yayınla"
              onPress={() => openWeb("/onboarding")}
              external
              last={!roles.admin && !roles.moderator}
            />
          )}
          {(roles.admin || roles.moderator) && (
            <MenuRow
              icon="shield-checkmark-outline"
              label="Admin paneli"
              detail={roles.pending > 0 ? `${roles.pending} bekleyen` : undefined}
              onPress={() => openWeb("/admin")}
              external
              last
            />
          )}
        </MenuSection>

        <MenuSection title="Destek">
          <MenuRow icon="help-circle-outline" label="Sık sorulan sorular" onPress={() => router.push("/faq")} />
          <MenuRow icon="chatbubble-ellipses-outline" label="Geri bildirim gönder" onPress={() => router.push("/feedback")} />
          <MenuRow icon="settings-outline" label="Ayarlar" onPress={() => router.push("/settings")} last />
        </MenuSection>

        <Text style={styles.version}>Sıra Sende {version}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label, onPress }: { value: number; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.stat} onPress={onPress}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { alignItems: "center", justifyContent: "center", padding: 24, gap: 8 },
  centerText: { color: colors.muted, textAlign: "center", lineHeight: 20 },
  content: { padding: 16, paddingBottom: 40, alignSelf: "center", width: "100%", maxWidth: 720 },
  userCard: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLarge: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.surface, marginBottom: 6 },
  initial: { color: "#fff", fontSize: 26, fontWeight: "800" },
  name: { color: colors.text, fontSize: 20, fontWeight: "800" },
  handle: { color: colors.muted, marginTop: 2 },
  chips: { flexDirection: "row", gap: 6, marginTop: 6 },
  chip: {
    color: "#fdba74",
    fontSize: 11,
    fontWeight: "700",
    borderColor: "rgba(234,88,12,0.5)",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden",
  },
  wallet: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 20,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "#1c1206",
    borderColor: "rgba(245,158,11,0.35)",
    borderWidth: 1,
  },
  walletLabel: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  coinRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  coins: { color: colors.coin, fontSize: 30, fontWeight: "800" },
  walletHint: { color: colors.faint, fontSize: 12, marginTop: 4 },
  topUp: { backgroundColor: colors.coin, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  topUpText: { color: "#1c1206", fontWeight: "800" },
  stats: {
    flexDirection: "row",
    marginTop: 14,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 14,
  },
  stat: { flex: 1, alignItems: "center", paddingVertical: 12 },
  statValue: { color: colors.text, fontSize: 18, fontWeight: "800" },
  statLabel: { color: colors.faint, fontSize: 12, marginTop: 2 },
  primary: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 32, marginTop: 12 },
  primaryText: { color: "#fff", fontWeight: "700" },
  version: { color: colors.faint, fontSize: 12, textAlign: "center", marginTop: 28 },
});
