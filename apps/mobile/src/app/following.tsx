import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { api, type Library } from "@/lib/api";
import { colors } from "@/lib/config";
import { setFollowing } from "@/lib/social";

/** Creators the viewer follows, with unfollow. */
export default function FollowingScreen() {
  const [list, setList] = useState<Library["following"] | null>(null);

  useFocusEffect(
    useCallback(() => {
      api.library().then(
        (l) => setList(l.following),
        () => setList([])
      );
    }, [])
  );

  async function unfollow(id: string) {
    try {
      await setFollowing(id, false);
      setList((l) => (l ?? []).filter((c) => c.id !== id));
    } catch (e) {
      Alert.alert((e as Error).message);
    }
  }

  if (!list) return <ActivityIndicator color={colors.muted} style={styles.screen} />;

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={list}
      keyExtractor={(c) => c.id}
      ListEmptyComponent={
        <Text style={styles.empty}>Henüz kimseyi takip etmiyorsun. Dizi sayfasında creator’ı takip edebilirsin.</Text>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={styles.avatar}>
            <Text style={styles.initial}>{item.name.charAt(0).toLocaleUpperCase("tr")}</Text>
          </View>
          <Text style={styles.name}>{item.name}</Text>
          <Pressable onPress={() => unfollow(item.id)} hitSlop={8} style={styles.unfollow}>
            <Text style={styles.unfollowText}>Takibi bırak</Text>
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  initial: { color: colors.text, fontWeight: "800" },
  name: { color: colors.text, fontSize: 15, flex: 1 },
  unfollow: { borderColor: colors.border, borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  unfollowText: { color: colors.muted, fontSize: 13 },
  empty: { color: colors.faint, textAlign: "center", marginTop: 40, lineHeight: 20 },
});
