import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ShopChrome } from "@/components/layout/ShopChrome";
import { SITE } from "@/lib/site";
import { OrganizationJsonLd } from "@/components/seo/OrganizationJsonLd";
import { RoutePreloader } from "@/components/ui/RoutePreloader";
import { BootSplash } from "@/components/ui/BootSplash";
import { CookieBanner } from "@/components/ui/CookieBanner";
import { getPublicSettings } from "@/lib/settings";
import { TextsProvider } from "@/components/texts/TextsProvider";
import { AiGuard } from "@/components/security/AiGuard";
import { THEME_NOFLASH_SCRIPT, AdminThemeSync } from "@/components/admin/ThemeToggle";

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
  /* Task 147: ключевики расширены по кластерам ядра (вес тега мал,
     но нулевая цена; основная работа — title/description/H1/тексты) */
  keywords: [
    "новогодние подарки",
    "новогодние подарки Хабаровск",
    "сладкие подарки",
    "детские новогодние подарки",
    "корпоративные подарки",
    "новогодние подарки оптом",
    "подарочные наборы",
    "наборы конфет",
    "подарки на новый год",
    "новогодние подарки с доставкой",
    "Хабаровск",
    "Лакомка",
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
    <html lang="ru" className={poppins.variable} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        {/* Task 136: бут-сплэш со смешными фразами — ПЕРВЫЙ элемент body,
           запекается в статический HTML и отрисовывается до гидратации,
           пока едут CSS/JS (RoutePreloader покрывает только клиентскую
           навигацию). На /admin* гасится инлайн-скриптом. */}
        <BootSplash />
        {/* Task 121: тёмная тема админки — атрибут на <html> ставится ДО
           первой отрисовки (без вспышки светлой). Только на /admin-*;
           витрину не трогаем. suppressHydrationWarning — атрибут ставится
           только на клиенте, React не должен ругаться на html. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_NOFLASH_SCRIPT }} />
        <AdminThemeSync />
        <AiGuard />
        <TextsProvider texts={cfg.texts}>
          <RoutePreloader />
          <OrganizationJsonLd />
          <ShopChrome>
            <Header />
          </ShopChrome>
          <main className="flex-1">{children}</main>
          <ShopChrome>
            <Footer />
          </ShopChrome>
          <CookieBanner />
        </TextsProvider>
      </body>
    </html>
  );
}