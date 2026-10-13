import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/lib/config";
import { REPORT_REASONS, reportContent, type ReportReason } from "@/lib/social";

/** Bottom sheet to report a series or one episode to moderation (Google Play UGC requirement). */
export function ReportSheet({
  visible,
  onClose,
  seriesId,
  episodeId,
  subject,
}: {
  visible: boolean;
  onClose: () => void;
  seriesId: string;
  episodeId?: string;
  /** e.g. "Kızıl elma · Bölüm 3" */
  subject: string;
}) {
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  function close() {
    setReason(null);
    setNote("");
    onClose();
  }

  async function send() {
    if (!reason) return;
    setBusy(true);
    try {
      if (await reportContent({ seriesId, episodeId, reason, note })) {
        Alert.alert("Bildirimin alındı", "Ekibimiz içeriği inceleyecek. Teşekkürler.");
        close();
      }
    } catch (e) {
      Alert.alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.head}>
          <Text style={styles.title}>İçeriği bildir</Text>
          <Pressable onPress={close} hitSlop={10} accessibilityLabel="Kapat">
            <Ionicons name="close" size={22} color={colors.muted} />
          </Pressable>
        </View>
        <Text style={styles.subject} numberOfLines={1}>
          {subject}
        </Text>
        {REPORT_REASONS.map((r) => (
          <Pressable key={r.key} style={styles.reason} onPress={() => setReason(r.key)}>
            <Ionicons
              name={reason === r.key ? "radio-button-on" : "radio-button-off"}
              size={20}
              color={reason === r.key ? colors.accent : colors.faint}
            />
            <Text style={styles.reasonText}>{r.label}</Text>
          </Pressable>
        ))}
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Ek açıklama (isteğe bağlı)"
          placeholderTextColor={colors.faint}
          maxLength={1000}
          multiline
          style={styles.note}
        />
        <Pressable style={[styles.send, (!reason || busy) && styles.disabled]} onPress={send} disabled={!reason || busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendText}>Bildir</Text>}
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    gap: 4,
  },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: colors.text, fontSize: 18, fontWeight: "800" },
  subject: { color: colors.muted, fontSize: 13, marginBottom: 8 },
  reason: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  reasonText: { color: colors.text, fontSize: 15 },
  note: {
    minHeight: 64,
    color: colors.text,
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
    textAlignVertical: "top",
  },
  send: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 13, alignItems: "center", marginTop: 10 },
  disabled: { opacity: 0.4 },
  sendText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
