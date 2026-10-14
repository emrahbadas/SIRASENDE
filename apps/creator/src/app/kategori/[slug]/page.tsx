import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { OG_BASE } from "@/lib/site";
import { Storefront } from "../../storefront";

export const dynamic = "force-dynamic";

const loadCategory = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("categories").select("slug, name_tr").eq("slug", slug).maybeSingle();
  return data;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const category = await loadCategory((await params).slug);
  if (!category) return { title: "Kategori bulunamadı", robots: { index: false } };
  const url = `/kategori/${category.slug}`;
  return {
    title: `${category.name_tr} dizileri — kısa dikey diziler`,
    description: `${category.name_tr} türünde kısa dikey diziler: bölüm bölüm izle, ilk bölümler ücretsiz.`,
    alternates: { canonical: url },
    openGraph: { ...OG_BASE, type: "website", url },
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const category = await loadCategory((await params).slug);
  if (!category) notFound();
  return <Storefront category={category.slug} />;
}
