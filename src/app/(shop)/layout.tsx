import { getPublicSettings } from "@/lib/settings";
import { YandexMetrika } from "@/components/analytics/YandexMetrika";

/* Layout группы (shop): снегопад теперь живёт в Hero-блоке главной
   (см. Hero.tsx + Snowfall.tsx), тексты страниц раздаются
   TextsProvider'ом из корневого layout.

   Яндекс.Метрика (Task 107) вшивается только на страницах витрины:
   в админке (/admin) счётчик НЕ подключается, чтобы не портить
   статистику служебными визитами. getPublicSettings() кешируется
   React cache() — второй вызов в рамках запроса не даёт лишнего
   запроса к API. */
export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cfg = await getPublicSettings();
  const ymId = cfg.ym_id.trim();

  return (
    <>
      {ymId !== "" && <YandexMetrika counterId={ymId} />}
      {children}
    </>
  );
}
