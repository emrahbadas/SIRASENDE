import Constants from "expo-constants";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MenuRow, MenuSection } from "@/components/menu-row";
import { adPrivacyOptionsRequired, showAdPrivacyOptions } from "@/lib/ads";
import { useAuth } from "@/lib/auth";
import { colors, config } from "@/lib/config";
import { setBlocked } from "@/lib/social";
import { supabase } from "@/lib/supabase";

type Blocked = { creator_id: string; creator_profiles: { creator_name: string } | { creator_name: string }[] | null };

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
const openWeb = (path: string) => WebBrowser.openBrowserAsync(`${config.apiUrl}${path}`);

export default function SettingsScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [displayName, setDisplayName] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);
  const [blocked, setBlockedList] = useState<Blocked[]>([]);
  const [deleting, setDeleting] = useState(false);
  // Shown only where the consent rules require it (EEA/UK)
  const [adPrivacy, setAdPrivacy] = useState(false);

  useEffect(() => {
    adPrivacyOptionsRequired().then(setAdPrivacy).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        setDisplayName(data?.display_name ?? "");
        setSaved(data?.display_name ?? "");
      });
    supabase
      .from("creator_blocks")
      .select("creator_id, creator_profiles(creator_name)")
      .order("created_at", { ascending: false })
      .then(({ data }) => setBlockedList((data ?? []) as Blocked[]));
  }, [userId]);

  async function save() {
    const name = displayName.trim();
    if (name.length > 50) return Alert.alert("Görünen ad en fazla 50 karakter olabilir");
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: name || null })
      .eq("id", userId!);
    setBusy(false);
    if (error) return Alert.alert("Kaydedilemedi", "Lütfen tekrar dene.");
    setSaved(name);
  }

  async function unblock(creatorId: string) {
    try {
      await setBlocked(creatorId, false);
      setBlockedList((list) => list.filter((b) => b.creator_id !== creatorId));
    } catch (e) {
      Alert.alert((e as Error).message);
    }
  }

  function signOut() {
    Alert.alert("Çıkış yapılsın mı?", undefined, [
      { text: "Vazgeç", style: "cancel" },
      {
        text: "Çıkış yap",
        style: "destructive",
        onPress: async () => {
          await supabase.auth.signOut();
          router.back();
        },
      },
    ]);
  }

  async function deleteAccount() {
    setDeleting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch(`${config.apiUrl}/api/v1/me/delete-account`, {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message ?? "Hesap silinemedi, lütfen tekrar dene");
      await supabase.auth.signOut().catch(() => undefined);
      Alert.alert("Hesabın silindi", "Sıra Senin'i kullandığın için teşekkürler.");
      router.replace("/");
    } catch (e) {
      Alert.alert("Hesap silinemedi", (e as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  function confirmDelete() {
    Alert.alert(
      "Hesabın kalıcı olarak silinsin mi?",
      "İzleme geçmişin, listen, coin ve bonus coin bakiyen silinir; creator isen tüm yapımların ve videoların kaldırılır. Bu işlem geri alınamaz. Satın alma kayıtları yasal süre boyunca kimliğinden ayrılmış olarak saklanır.",
      [
        { text: "Vazgeç", style: "cancel" },
        { text: "Hesabımı sil", style: "destructive", onPress: deleteAccount },
      ]
    );
  }

  const legal = (
    <MenuSection title="Yasal">
      <MenuRow icon="shield-outline" label="Gizlilik Politikası" onPress={() => openWeb("/privacy")} external />
      <MenuRow
        icon="document-text-outline"
        label="Kullanım Şartları"
        onPress={() => openWeb("/terms")}
        external
        last={!adPrivacy}
      />
      {adPrivacy && (
        <MenuRow
          icon="megaphone-outline"
          label="Reklam gizlilik tercihleri"
          onPress={() => showAdPrivacyOptions().catch(() => Alert.alert("Şu an açılamadı", "Birazdan tekrar dene."))}
          last
        />
      )}
    </MenuSection>
  );

  if (!session) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.muted}>Hesap ayarları için giriş yapmalısın.</Text>
        {legal}
      </ScrollView>
    );
  }

  const dirty = displayName.trim() !== saved;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.label}>Görünen ad</Text>
      <TextInput
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Profilinde görünecek ad"
        placeholderTextColor={colors.faint}
        maxLength={50}
        style={styles.input}
      />
      <Pressable style={[styles.save, (!dirty || busy) && styles.disabled]} onPress={save} disabled={!dirty || busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Kaydet</Text>}
      </Pressable>

      <Text style={styles.label}>E-posta</Text>
      <Text style={styles.value}>{session.user.email}</Text>

      <Text style={styles.label}>Engellenen creator&apos;lar</Text>
      {blocked.length === 0 ? (
        <Text style={styles.muted}>Kimseyi engellemedin. Dizi sayfasından bir creator&apos;ı engelleyebilirsin.</Text>
      ) : (
        <View style={styles.group}>
          {blocked.map((b, i) => (
            <View key={b.creator_id} style={[styles.blockRow, i < blocked.length - 1 && styles.divider]}>
              <Text style={styles.blockName}>{one(b.creator_profiles)?.creator_name ?? "Creator"}</Text>
              <Pressable onPress={() => unblock(b.creator_id)} hitSlop={8}>
                <Text style={styles.unblock}>Engeli kaldır</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {legal}

      <MenuSection title="Hesap">
        <MenuRow icon="log-out-outline" label="Çıkış yap" onPress={signOut} />
        <MenuRow
          icon="trash-outline"
          label={deleting ? "Hesap siliniyor…" : "Hesabımı sil"}
          onPress={deleting ? () => undefined : confirmDelete}
          last
        />
      </MenuSection>

      <Text style={styles.version}>Sürüm {Constants.expoConfig?.version}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  label: { color: colors.faint, fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginTop: 18, marginBottom: 8, marginLeft: 4 },
  input: {
    color: colors.text,
    fontSize: 15,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  save: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 12, alignItems: "center", marginTop: 10 },
  disabled: { opacity: 0.4 },
  saveText: { color: "#fff", fontWeight: "700" },
  value: { color: colors.text, fontSize: 15, marginLeft: 4 },
  muted: { color: colors.faint, marginLeft: 4, lineHeight: 19 },
  group: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14 },
  blockRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 12 },
  divider: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  blockName: { color: colors.text, fontSize: 15 },
  unblock: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  version: { color: colors.faint, fontSize: 12, textAlign: "center", marginTop: 28 },
});
