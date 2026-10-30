import { NotFoundView } from "@/components/NotFoundView";

export const metadata = {
  title: "Страница не найдена — Лакомка",
};

/* Смешная 404: страница «потерялась» по-новогоднему — случайная отговорка
 * из 30 фраз при каждой загрузке (см. src/lib/not-found-phrases.ts).
 * В статическом деплое Next.js собирает её в /404.html, Apache показывает
 * её через ErrorDocument 404 (см. scripts/deploy/.htaccess). */
export default function NotFound() {
  return <NotFoundView />;
}
