import { getPublicSettings } from "@/lib/settings";
import { YandexMetrika } from "@/components/analytics/YandexMetrika";
import { MetrikaBlock } from "@/components/analytics/MetrikaBlock";
import { AdminToolbar } from "@/components/layout/AdminToolbar";

/* Layout группы (shop): снегопад теперь живёт в Hero-блоке главной
   (см. Hero.tsx + Snowfall.tsx), тексты страниц раздаются
   TextsProvider'ом из корневого layout.

   Яндекс.Метрика (Task 107/114) вшивается только на страницах витрины:
   в админке (/admin) счётчик НЕ подключается, чтобы не портить
   статистику служебными визитами. Приоритет: встраиваемый блок
   (metrika_code, Task 114) → если он не задан, старый номер счётчика
   (ym_id). getPublicSettings() кешируется React cache() — второй вызов
   в рамках запроса не даёт лишнего запроса к API.

   AdminToolbar (Task 114) — плавающая панель админа на витрине
   (кнопка «Редактировать товар» на карточках); для покупателей
   рендерится пустотой. */
export default async function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cfg = await getPublicSettings();
  const ymId = cfg.ym_id.trim();
  const metrikaCode = cfg.metrika_code.trim();

  return (
    <>
      {/* MetrikaBlock монтируется ВСЕГДА: даже если на сборке блока не было,
          он добирает metrika_code с API и вставляет его без пересборки.
          Запечённый код — начальное содержимое контейнера. */}
      <MetrikaBlock bakedCode={metrikaCode} />
      {metrikaCode === "" && ymId !== "" && <YandexMetrika counterId={ymId} />}
      {children}
      <AdminToolbar />
    </>
  );
}
