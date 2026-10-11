import { Image } from "expo-image";
import { Link } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CatalogSeries } from "@/lib/api";
import { colors } from "@/lib/config";

export function SeriesCard({ series, width }: { series: CatalogSeries; width: number }) {
  return (
    <Link href={{ pathname: "/series/[id]", params: { id: series.id } }} asChild>
      <Pressable style={{ width }}>
        <View style={[styles.poster, { width, height: width * (13 / 9) }]}>
          {series.poster ? (
            <Image source={{ uri: series.poster }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
          ) : (
            <Text style={styles.placeholder} numberOfLines={3}>
              {series.title}
            </Text>
          )}
          {series.ageRating && <Text style={styles.age}>{series.ageRating}</Text>}
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {series.title}
        </Text>
        {series.categories[0] && (
          <Text style={styles.tag} numberOfLines={1}>
            {series.categories[0].name_tr}
          </Text>
        )}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  poster: {
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholder: { color: colors.faint, fontWeight: "700", textAlign: "center", paddingHorizontal: 8 },
  age: {
    position: "absolute",
    top: 6,
    right: 6,
    color: "#fbbf24",
    fontSize: 10,
    fontWeight: "700",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: "hidden",
  },
  title: { color: colors.text, fontSize: 13, fontWeight: "600", marginTop: 6 },
  tag: { color: colors.faint, fontSize: 11, marginTop: 2 },
});
