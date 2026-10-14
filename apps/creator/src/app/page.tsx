import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";
import { LEGAL } from "@/lib/legal";
import { OG_BASE, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";
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
  return (
    <>
      <script
        type="application/ld+json"
        // Static JSON; "<" escaped so no value can close the script tag
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Storefront />
    </>
  );
}

// schema.org: who runs the site (logo, support contact) and the site itself
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: { "@type": "ImageObject", url: `${SITE_URL}/icon.png`, width: 512, height: 512 },
      contactPoint: { "@type": "ContactPoint", contactType: "customer support", email: LEGAL.email, availableLanguage: ["tr"] },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      inLanguage: "tr",
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
  ],
};
