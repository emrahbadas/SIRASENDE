// Canonical public address of the web app (SEO, share links, QR codes)
export const SITE_URL = process.env.SITE_URL ?? "https://sirasenin.app";
export const SITE_HOST = new URL(SITE_URL).host;

export const SITE_NAME = "Sıra Senin";
export const SITE_DESCRIPTION =
  "Kısa dikey diziler: bölüm bölüm izle, kendi dizini yayınla, izlendikçe kazan. Romantik, dram, gerilim, komedi ve daha fazlası.";

// Page-level openGraph replaces the root one entirely, so pages spread this in
export const OG_BASE = { siteName: SITE_NAME, locale: "tr_TR" } as const;
