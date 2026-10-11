import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Public JSON API for the mobile app. Callers authenticate with their Supabase
// access token (`Authorization: Bearer …`), so RLS and RPC checks run as them.
// No cookies are involved, which is why any origin may call it.

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export function preflight() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** Supabase client acting as the caller (anonymous when no token is sent). */
export function callerClient(request: Request) {
  const auth = request.headers.get("authorization");
  const token = auth?.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : null;
  return {
    token,
    supabase: createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    }),
  };
}

export async function callerUserId(request: Request) {
  const { token, supabase } = callerClient(request);
  if (!token) return { supabase, userId: null };
  const { data } = await supabase.auth.getUser(token);
  return { supabase, userId: data.user?.id ?? null };
}

export const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
