import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { getLocale } from "@/lib/i18n/server";
import { LocaleProvider } from "@/lib/i18n/context";
import { getTheme } from "@/lib/theme/server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const langMap = { zh: "zh-Hans", en: "en", ja: "ja", fr: "fr" } as const;

export const metadata: Metadata = {
  title: {
    default: "活字 Huozi — 以文载道，活字为器",
    template: "%s | 活字 Huozi",
  },
  description:
    "Markdown & HTML Publisher for Agents. Turn your content into beautiful, shareable web pages via API.",
  metadataBase: new URL("https://huozi.app"),
  openGraph: {
    type: "website",
    siteName: "活字 Huozi",
    locale: "zh_CN",
    description: "Markdown & HTML Publisher for Agents.",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [locale, theme] = await Promise.all([getLocale(), getTheme()]);

  return (
    <html
      lang={langMap[locale]}
      data-theme={theme}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans bg-background text-foreground">
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
        {/* Portal root for Glide Data Grid cell overlays. */}
        <div id="portal" style={{ position: "fixed", left: 0, top: 0, zIndex: 9999 }} />
      </body>
    </html>
  );
}
