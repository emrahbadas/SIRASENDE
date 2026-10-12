/** Normalizes a Turkish IBAN ("tr12 0006 …" → "TR120006…"). */
export const normalizeIban = (v: string) => v.replace(/\s+/g, "").toUpperCase();

/** TR + 24 digits with a valid ISO 13616 mod-97 checksum. */
export function isValidTrIban(iban: string) {
  if (!/^TR\d{24}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let remainder = 0;
  for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  return remainder === 1;
}

/** "TR12 0006 1000 …" for display. */
export const formatIban = (iban: string) => iban.replace(/(.{4})/g, "$1 ").trim();
