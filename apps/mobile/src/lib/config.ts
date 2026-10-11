import { Platform } from "react-native";

// Public configuration only — everything here ships inside the app bundle.
// Secrets (signing keys, service role) stay on the server behind /api/v1.

const PRODUCTION_API = "https://sirasende-indol.vercel.app";

// A local API override only makes sense for the web preview: on a phone,
// "localhost" is the phone itself, so devices always use EXPO_PUBLIC_API_URL
// (production by default).
const apiUrl =
  (Platform.OS === "web" ? process.env.EXPO_PUBLIC_WEB_API_URL : undefined) ??
  process.env.EXPO_PUBLIC_API_URL ??
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
  accent: "#e11d48",
  coin: "#f59e0b",
  success: "#34d399",
};
