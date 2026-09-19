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

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  title: "BUNII — A small world, wide open",
  description:
    "A free-mint bunny world of five realms, each one packed for a different kind of trouble. Wander in and pick a face.",
  openGraph: {
    url: "/",
    siteName: "BUNII",
    title: "BUNII — A small world, wide open",
    description: "A free-mint bunny world. Five realms. Wander in and pick a face.",
    images: ["/pfp/seraph.jpeg"],
  },
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
