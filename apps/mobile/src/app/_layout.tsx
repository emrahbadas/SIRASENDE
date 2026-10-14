import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { CurtainIntro } from "@/components/curtain-intro";
import { prepareAds } from "@/lib/ads";
import { AuthProvider } from "@/lib/auth";
import { colors } from "@/lib/config";

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.background, card: colors.background, primary: colors.accent },
};

export default function RootLayout() {
  // Ad consent (EEA/UK) is asked once at launch, before any ad request
  useEffect(() => {
    prepareAds().catch(() => undefined);
  }, []);

  return (
    <AuthProvider>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerTintColor: colors.text, headerBackTitle: "Geri" }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="series/[id]" options={{ title: "" }} />
          <Stack.Screen name="watch/[seriesId]" options={{ headerShown: false, animation: "fade" }} />
          <Stack.Screen name="login" options={{ title: "Giriş yap", presentation: "modal" }} />
          <Stack.Screen name="following" options={{ title: "Takip ettiklerim" }} />
          <Stack.Screen name="faq" options={{ title: "Sık sorulan sorular" }} />
          <Stack.Screen name="feedback" options={{ title: "Geri bildirim" }} />
          <Stack.Screen name="settings" options={{ title: "Ayarlar" }} />
        </Stack>
        <CurtainIntro />
      </ThemeProvider>
    </AuthProvider>
  );
}
