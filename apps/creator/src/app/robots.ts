import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { SITE_HOST, SITE_URL } from "@/lib/site";

// Only the canonical domain is crawlable; vercel.app and preview hosts are not
export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = (await headers()).get("host") ?? "";
  if (host !== SITE_HOST) {
    return { rules: { userAgent: "*", disallow: "/" } };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/studio", "/statements", "/verify", "/api", "/auth", "/onboarding", "/watch"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
