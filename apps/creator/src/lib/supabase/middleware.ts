import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SITE_HOST } from "@/lib/site";

// /watch decides access per episode (free window); webhooks authenticate by signature;
// /api/v1 (mobile app) authenticates with a bearer token, not cookies
const PUBLIC_PREFIXES = [
  "/series",
  "/kategori",
  "/watch",
  "/login",
  "/signup",
  "/auth",
  "/api/webhooks",
  "/api/v1",
  "/privacy",
  "/terms",
  "/account/delete",
  "/verify",
  "/robots.txt",
  "/sitemap.xml",
  "/app-ads.txt",
  "/opengraph-image",
];

function isPublicPath(path: string) {
  if (path === "/") return true;
  return PUBLIC_PREFIXES.some((p) => path.startsWith(p));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Required: refreshes the session; do not run logic between client creation and getUser
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  if (!user && !isPublicPath(path)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Return to the requested page after signing in
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  // Only the canonical domain may be indexed (vercel.app serves the same pages)
  if (request.headers.get("host") !== SITE_HOST) {
    supabaseResponse.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return supabaseResponse;
}
