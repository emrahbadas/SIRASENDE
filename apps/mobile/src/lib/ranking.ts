import type { CatalogSeries } from "./api";

export type SortTab = "popular" | "trending" | "new";

export const SORT_TABS: { key: SortTab; label: string }[] = [
  { key: "popular", label: "Popüler" },
  { key: "trending", label: "Gündemde" },
  { key: "new", label: "Yeni" },
];

export type Badge = "İzliyorum" | "Gündemde" | "Yeni";

const NEW_DAYS = 14;
const TRENDING_TOP = 3;

const isNew = (s: CatalogSeries, now: number) =>
  now - new Date(s.publishedAt).getTime() < NEW_DAYS * 24 * 60 * 60 * 1000;

export function sortSeries(list: CatalogSeries[], tab: SortTab): CatalogSeries[] {
  const by = {
    popular: (a: CatalogSeries, b: CatalogSeries) => b.views - a.views || b.views7d - a.views7d,
    trending: (a: CatalogSeries, b: CatalogSeries) => b.views7d - a.views7d || b.views - a.views,
    new: (a: CatalogSeries, b: CatalogSeries) => b.publishedAt.localeCompare(a.publishedAt),
  }[tab];
  return [...list].sort(by);
}

/**
 * One corner badge per poster, most personal first: series the viewer is in
 * the middle of, then this week's top series, then recent releases.
 */
export function badgesFor(list: CatalogSeries[], watching: Set<string>, now = Date.now()) {
  const trending = new Set(
    sortSeries(list.filter((s) => s.views7d > 0), "trending")
      .slice(0, TRENDING_TOP)
      .map((s) => s.id)
  );
  return new Map<string, Badge>(
    list.flatMap((s): [string, Badge][] => {
      if (watching.has(s.id)) return [[s.id, "İzliyorum"]];
      if (trending.has(s.id)) return [[s.id, "Gündemde"]];
      if (isNew(s, now)) return [[s.id, "Yeni"]];
      return [];
    })
  );
}

/** "No 3 · En çok izlenen" for the top of the popular / trending lists. */
export function rankLabel(tab: SortTab, index: number, s: CatalogSeries) {
  if (index >= 10) return null;
  if (tab === "popular" && s.views > 0) return `No ${index + 1} · En çok izlenen`;
  if (tab === "trending" && s.views7d > 0) return `No ${index + 1} · Bu hafta`;
  return null;
}

/** 950 → "950", 1 250 → "1,2B", 3 400 000 → "3,4Mn" (Turkish short scale). */
export function formatViews(n: number) {
  const fmt = (v: number, unit: string) => `${(Math.floor(v * 10) / 10).toString().replace(".", ",")}${unit}`;
  if (n >= 1_000_000) return fmt(n / 1_000_000, "Mn");
  if (n >= 1_000) return fmt(n / 1_000, "B");
  return String(n);
}

/** Case- and accent-insensitive match on title, creator and genres (Turkish-aware). */
export function matchesSearch(s: CatalogSeries, query: string) {
  // NFD strips ş/ğ/ç/ö/ü marks; dotless ı has no decomposition, so map it too
  const norm = (v: string) =>
    v.toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");
  const q = norm(query.trim());
  if (!q) return true;
  return [s.title, s.creatorName ?? "", ...s.categories.map((c) => c.name_tr)].some((v) => norm(v).includes(q));
}
