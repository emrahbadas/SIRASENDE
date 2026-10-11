import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors } from "@/lib/config";
import { supabase } from "@/lib/supabase";

export default function LoginScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    const credentials = { email: email.trim(), password };
    const { data, error } =
      mode === "login"
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp(credentials);
    setBusy(false);

    if (error) return setMessage({ text: error.message, error: true });
    if (mode === "signup" && !data.session) {
      return setMessage({ text: "E-postana gelen bağlantıyla hesabını doğrula, sonra giriş yap.", error: false });
    }
    router.back();
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>{mode === "login" ? "Giriş yap" : "Hesap oluştur"}</Text>
      <Text style={styles.subtitle}>Kilitli bölümleri açmak ve kaldığın yeri her cihazda görmek için.</Text>

      <TextInput
        style={styles.input}
        placeholder="E-posta"
        placeholderTextColor={colors.faint}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Şifre"
        placeholderTextColor={colors.faint}
        secureTextEntry
        autoComplete={mode === "login" ? "current-password" : "new-password"}
        value={password}
        onChangeText={setPassword}
      />

      {message && <Text style={{ color: message.error ? "#fb7185" : colors.success, marginTop: 8 }}>{message.text}</Text>}

      <Pressable style={styles.button} onPress={submit} disabled={busy || !email || password.length < 6}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{mode === "login" ? "Giriş yap" : "Kayıt ol"}</Text>}
      </Pressable>

      <Pressable onPress={() => setMode(mode === "login" ? "signup" : "login")}>
        <Text style={styles.switch}>
          {mode === "login" ? "Hesabın yok mu? Kayıt ol" : "Zaten hesabın var mı? Giriş yap"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: 24, gap: 10 },
  title: { color: colors.text, fontSize: 24, fontWeight: "800" },
  subtitle: { color: colors.muted, marginBottom: 12 },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  button: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  switch: { color: colors.muted, textAlign: "center", marginTop: 14 },
});
