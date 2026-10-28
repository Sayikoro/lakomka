import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { SITE } from "@/lib/site";
import { OrganizationJsonLd } from "@/components/seo/OrganizationJsonLd";
import { RoutePreloader } from "@/components/ui/RoutePreloader";
import { CookieBanner } from "@/components/ui/CookieBanner";
import { getPublicSettings } from "@/lib/settings";
import { TextsProvider } from "@/components/texts/TextsProvider";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — новогодние подарки и наборы конфет`,
    template: `%s — ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  authors: [{ name: SITE.legalName }],
  generator: "Next.js",
  keywords: [
    "новогодние подарки",
    "подарочные наборы",
    "конфеты",
    "Хабаровск",
    "Лакомка",
    "корпоративные подарки",
  ],
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: SITE.name,
    url: SITE.url,
    title: `${SITE.name} — новогодние подарки и наборы конфет`,
    description: SITE.description,
    images: [{ url: SITE.ogImage, width: 1200, height: 630, alt: SITE.name }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} — новогодние подарки и наборы конфет`,
    description: SITE.description,
    images: [SITE.ogImage],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: { canonical: "/" },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /* Тексты страниц («Текст на страницах») — один fetch на запрос
     (React cache дедуплицирует с вызовами в страницах) */
  const cfg = await getPublicSettings();

  return (
    <html lang="ru" className={poppins.variable}>
      <body className="flex min-h-screen flex-col">
        <TextsProvider texts={cfg.texts}>
          <RoutePreloader />
          <OrganizationJsonLd />
          <Header />
          <main className="flex-1">{children}</main>
          <Footer texts={cfg.texts} />
          <CookieBanner />
        </TextsProvider>
      </body>
    </html>
  );
}