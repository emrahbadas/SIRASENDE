import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "@/lib/config";

const QUESTIONS: { q: string; a: string }[] = [
  {
    q: "Sıra Senin nedir?",
    a: "Bölümleri birkaç dakikalık, telefona göre dikey çekilmiş kısa diziler platformu. İzleyebilir ya da kendi dizini yayınlayıp izlendikçe kazanabilirsin.",
  },
  {
    q: "Hangi bölümler ücretsiz?",
    a: "Her dizinin ilk bölümleri ücretsiz: dizinin yaklaşık beşte biri, en az 1, en fazla 8 bölüm. Diğer bölümleri 2 kısa reklam izleyerek (günde en fazla 8 bölüm, her gece 00:00'da yenilenir) ya da coin ile açabilirsin.",
  },
  {
    q: "Açtığım bölüm tekrar kilitlenir mi?",
    a: "Hayır. Reklamla ya da coin ile açtığın bölüm hesabında kalıcı olarak açık kalır.",
  },
  {
    q: "Coin nedir, nasıl alınır?",
    a: "Coin, bölümleri reklam izlemeden hemen açmana yarar. Uygulama içinden coin satın alma, uygulama mağazaya çıktığında açılacak.",
  },
  {
    q: "Kaldığım yerden nasıl devam ederim?",
    a: "İzlediğin her bölümde nerede kaldığın kaydedilir. Ana sayfadaki “Kaldığın yerden devam et” bölümünden ya da Listem sekmesinden devam edebilirsin. Giriş yaptıysan tüm cihazlarında aynı yerden devam edersin.",
  },
  {
    q: "Nasıl creator olurum?",
    a: "Profil → “Creator ol” ile creator hesabını aç. Creator Studio’da yapımını oluşturup bölümlerini yüklersin; platform incelemesinden sonra yayına çıkar. Yayındaki diziye yeni bölümleri istediğin zaman ekleyebilirsin.",
  },
  {
    q: "Creator’lar nasıl kazanır?",
    a: "Dizindeki reklam gelirinden ve coin ile açılan bölümlerden pay alırsın. Kazancını Creator Studio’daki Gelir sayfasından IBAN’ına çekebilirsin.",
  },
  {
    q: "Uygunsuz bir içerik gördüm, ne yapmalıyım?",
    a: "Profil → “Geri bildirim gönder”den “İçerik bildirimi” seçip hangi dizi ve bölüm olduğunu yaz. Ekibimiz inceleyip gerekirse içeriği yayından kaldırır.",
  },
];

export default function FaqScreen() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {QUESTIONS.map((item, i) => {
        const expanded = open === i;
        return (
          <View key={item.q} style={styles.item}>
            <Pressable style={styles.question} onPress={() => setOpen(expanded ? null : i)}>
              <Text style={styles.qText}>{item.q}</Text>
              <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.faint} />
            </Pressable>
            {expanded && <Text style={styles.answer}>{item.a}</Text>}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  item: { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  question: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 16 },
  qText: { color: colors.text, fontSize: 15, fontWeight: "600", flex: 1 },
  answer: { color: colors.muted, fontSize: 14, lineHeight: 21, paddingBottom: 16 },
});
