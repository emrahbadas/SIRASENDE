import QRCode from "qrcode";

// Always the live site: local and production share one database, so a
// statement printed anywhere verifies on the public domain.
const SITE_URL = process.env.SITE_URL ?? "https://sirasenin.app";

/** Public verification link of a statement. */
export async function statementVerifyUrl(number: string, token: string) {
  return `${SITE_URL}/verify/hakedis/${encodeURIComponent(number)}?token=${token}`;
}

export const qrSvg = (text: string) =>
  QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0f172a", light: "#ffffff" } });
