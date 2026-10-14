import type { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { SITE_URL } from "@/lib/site";

// Rebuilt at most hourly; lists the storefront, categories and every published series
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const admin = createAdminClient();
  const [{ data: series }, { data: categories }] = await Promise.all([
    admin
      .from("series")
      .select("id, updated_at")
      .eq("status", "published")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false }),
    admin.from("categories").select("slug"),
  ]);

  const latest = series?.[0]?.updated_at ? new Date(series[0].updated_at) : new Date();

  return [
    { url: SITE_URL, lastModified: latest, changeFrequency: "daily", priority: 1 },
    ...(categories ?? []).map((c) => ({
      url: `${SITE_URL}/kategori/${encodeURIComponent(c.slug)}`,
      lastModified: latest,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
    ...(series ?? []).map((s) => ({
      url: `${SITE_URL}/series/${s.id}`,
      lastModified: s.updated_at ? new Date(s.updated_at) : latest,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
