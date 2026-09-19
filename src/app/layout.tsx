import type { Metadata, Viewport } from "next";
import { Baloo_2, Nunito, JetBrains_Mono } from "next/font/google";
import { SITE_URL } from "@/lib/site-url";
import "./globals.css";

const display = Baloo_2({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const body = Nunito({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const TITLE = "BUNII — A small world, wide open";
const DESCRIPTION =
  "A free-mint bunny world of five realms, each one packed for a different kind of trouble. Wander in and pick a face.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },

  // A template so /join and anything added later get "<page> — BUNII" without
  // each page restating the brand.
  title: { default: TITLE, template: "%s — BUNII" },
  description: DESCRIPTION,
  applicationName: "BUNII",
  keywords: ["BUNII", "NFT", "free mint", "PFP", "allowlist", "bunny"],

  openGraph: {
    type: "website",
    url: "/",
    siteName: "BUNII",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_US",
  },

  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },

  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },

  // The icons themselves are picked up from the files beside this one
  // (icon.png, apple-icon.png, favicon.ico) — Next wires those up on its own,
  // so listing them here would only risk the two drifting apart.
};

export const viewport: Viewport = {
  themeColor: "#bfe0ff",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body className="grain antialiased">{children}</body>
    </html>
  );
}
