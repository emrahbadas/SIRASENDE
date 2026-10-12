import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "@/lib/config";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

/** Grouped list section with a small heading, iOS-settings style. */
export function MenuSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      {title && <Text style={styles.heading}>{title}</Text>}
      <View style={styles.group}>{children}</View>
    </View>
  );
}

/** One tappable row: icon, label, optional detail text and trailing icon. */
export function MenuRow({
  icon,
  label,
  detail,
  onPress,
  external,
  last,
}: {
  icon: IconName;
  label: string;
  detail?: string;
  onPress: () => void;
  /** Opens outside the app (web) */
  external?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.divider, pressed && styles.pressed]}
    >
      <Ionicons name={icon} size={19} color={colors.text} />
      <Text style={styles.label}>{label}</Text>
      {detail && <Text style={styles.detail}>{detail}</Text>}
      <Ionicons name={external ? "open-outline" : "chevron-forward"} size={16} color={colors.faint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 22 },
  heading: { color: colors.faint, fontSize: 12, fontWeight: "700", textTransform: "uppercase", marginBottom: 8, marginLeft: 4 },
  group: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 14, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
  divider: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  pressed: { backgroundColor: "rgba(255,255,255,0.04)" },
  label: { color: colors.text, fontSize: 15, flex: 1 },
  detail: { color: colors.muted, fontSize: 13 },
});
