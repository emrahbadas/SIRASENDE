import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { OG_BASE } from "@/lib/site";
import { Storefront } from "./storefront";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: { ...OG_BASE, type: "website", url: "/" },
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;
  // Old filter links (?category=) move to crawlable category pages
  if (category && /^[a-z0-9_-]+$/.test(category)) permanentRedirect(`/kategori/${category}`);
  return <Storefront />;
}
