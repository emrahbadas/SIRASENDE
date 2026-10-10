import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sıra Sende — Creator Studio",
  description: "Hikâyeni üret. Yayınla. Kazan.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
