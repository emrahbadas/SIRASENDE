import Constants from "expo-constants";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput } from "react-native";
import { MenuRow, MenuSection } from "@/components/menu-row";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/config";
import { supabase } from "@/lib/supabase";

export default function SettingsScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const [displayName, setDisplayName] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);

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

  if (!session) {
    return (
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <Text style={styles.muted}>Ayarlar için giriş yapmalısın.</Text>
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

      <MenuSection title="Hesap">
        <MenuRow icon="log-out-outline" label="Çıkış yap" onPress={signOut} last />
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
  muted: { color: colors.faint },
  version: { color: colors.faint, fontSize: 12, textAlign: "center", marginTop: 28 },
});
