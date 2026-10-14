import { headers } from "next/headers";
import QRCode from "qrcode";

/** Public verification link of a statement (current host, so it also works locally). */
export async function statementVerifyUrl(number: string, token: string) {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "sirasenin.app";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || /^\d/.test(host) ? "http" : "https");
  return `${proto}://${host}/verify/hakedis/${encodeURIComponent(number)}?token=${token}`;
}

export const qrSvg = (text: string) =>
  QRCode.toString(text, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0f172a", light: "#ffffff" } });
