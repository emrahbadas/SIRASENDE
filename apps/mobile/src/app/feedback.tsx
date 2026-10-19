import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { versionLabel } from "@/lib/app-version";
import { useAuth } from "@/lib/auth";
import { colors } from "@/lib/config";
import { supabase } from "@/lib/supabase";

const KINDS = [
  { key: "feedback", label: "Öneri / görüş" },
  { key: "bug", label: "Hata bildirimi" },
  { key: "content", label: "İçerik bildirimi" },
] as const;

type Kind = (typeof KINDS)[number]["key"];

const PLACEHOLDERS: Record<Kind, string> = {
  feedback: "Neyi sevdin, neyi geliştirelim?",
  bug: "Ne oldu, hangi ekrandaydın? Adım adım yazarsan hemen bulalım.",
  content: "Hangi dizi ve bölüm? İçerikte sorun ne?",
};

export default function FeedbackScreen() {
  const { session } = useAuth();
  const [kind, setKind] = useState<Kind>("feedback");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const valid = message.trim().length >= 5;

  async function send() {
    if (!session) return router.push("/login");
    setBusy(true);
    const { error } = await supabase.from("feedback").insert({
      profile_id: session.user.id,
      kind,
      message: message.trim(),
      app_version: versionLabel || null,
      platform: Platform.OS,
    });
    setBusy(false);
    if (error) {
      Alert.alert("Gönderilemedi", "Lütfen biraz sonra tekrar dene.");
      return;
    }
    Alert.alert("Teşekkürler!", "Mesajın ekibimize ulaştı.");
    router.back();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.kinds}>
        {KINDS.map((k) => (
          <Pressable key={k.key} onPress={() => setKind(k.key)} style={[styles.kind, kind === k.key && styles.kindActive]}>
            <Text style={[styles.kindText, kind === k.key && styles.kindTextActive]}>{k.label}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={message}
        onChangeText={setMessage}
        placeholder={PLACEHOLDERS[kind]}
        placeholderTextColor={colors.faint}
        multiline
        maxLength={2000}
        style={styles.input}
        textAlignVertical="top"
      />
      <Text style={styles.counter}>{message.length} / 2000</Text>
      <Pressable style={[styles.send, (!valid || busy) && styles.disabled]} onPress={send} disabled={!valid || busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>{session ? "Gönder" : "Göndermek için giriş yap"}</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16 },
  kinds: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
  kind: { borderColor: colors.border, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  kindActive: { borderColor: colors.accent, backgroundColor: "rgba(234,88,12,0.14)" },
  kindText: { color: colors.muted, fontSize: 13 },
  kindTextActive: { color: "#fdba74", fontWeight: "600" },
  input: {
    minHeight: 160,
    color: colors.text,
    fontSize: 15,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  counter: { color: colors.faint, fontSize: 11, textAlign: "right", marginTop: 4 },
  send: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 16 },
  disabled: { opacity: 0.4 },
  sendText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
