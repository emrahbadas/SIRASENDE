import { DarkTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/lib/auth";
import { colors } from "@/lib/config";

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.background, card: colors.background, primary: colors.accent },
};

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerTintColor: colors.text, headerBackTitle: "Geri" }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="series/[id]" options={{ title: "" }} />
          <Stack.Screen name="watch/[seriesId]" options={{ headerShown: false, animation: "fade" }} />
          <Stack.Screen name="login" options={{ title: "Giriş yap", presentation: "modal" }} />
        </Stack>
      </ThemeProvider>
    </AuthProvider>
  );
}
