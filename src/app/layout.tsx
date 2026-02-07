import type { Metadata } from "next";
import { Cinzel, Crimson_Pro } from "next/font/google";
import "./globals.css";

const cinzel = Cinzel({ subsets: ["latin"], variable: '--font-cinzel' });
const crimson = Crimson_Pro({ subsets: ["latin"], variable: '--font-crimson' });

export const metadata: Metadata = {
  title: "eyeAI - The Oracle",
  description: "An archaic interface for the modern world.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${cinzel.variable} ${crimson.variable} font-serif`}>{children}</body>
    </html>
  );
}
