import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Moneyprinter",
  description: "Track prediction markets and crypto opportunities in real time",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
