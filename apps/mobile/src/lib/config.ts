import Constants from "expo-constants";
import { Platform } from "react-native";

// Public configuration only — everything here ships inside the app bundle.
// Secrets (signing keys, service role) stay on the server behind /api/v1.

const PRODUCTION_API = "https://sirasenin.app";

// EXPO_PUBLIC_API_URL=dev-lan points a phone at the local API on the same
// computer that serves the JS bundle (port 3000), whatever network it is on —
// so a changing Wi-Fi/hotspot IP never needs editing. Development only.
function devLanApi() {
  const host = __DEV__ ? Constants.expoConfig?.hostUri?.split(":")[0] : undefined;
  return host ? `http://${host}:3000` : undefined;
}

// A localhost override only makes sense for the web preview: on a phone,
// "localhost" is the phone itself (production by default).
const configured = process.env.EXPO_PUBLIC_API_URL;
const apiUrl =
  (Platform.OS === "web" ? process.env.EXPO_PUBLIC_WEB_API_URL : undefined) ??
  (configured === "dev-lan" ? devLanApi() : configured) ??
  PRODUCTION_API;

export const config = {
  apiUrl: apiUrl.replace(/\/$/, ""),
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
};

export const colors = {
  background: "#09090b",
  surface: "#18181b",
  border: "#27272a",
  text: "#fafafa",
  muted: "#a1a1aa",
  faint: "#71717a",
  accent: "#EA580C", // brand orange (logo gradient #FFB020 → #F2550F)
  coin: "#f59e0b",
  success: "#34d399",
};
