import QRCode from "qrcode";
import { SITE_URL } from "./site";

// Always the live site: local and production share one database, so a
// statement printed anywhere verifies on the public domain.

/** Public verification link of a statement. */
export async function statementVerifyUrl(number: string, token: string) {
  return `${SITE_URL}/verify/hakedis/${encodeURIComponent(number)}?token=${token}`;
}

export const qrSvg = (text: string) =>
  QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0f172a", light: "#ffffff" } });
