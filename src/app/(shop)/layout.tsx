/* Layout группы (shop): снегопад теперь живёт в Hero-блоке главной
   (см. Hero.tsx + Snowfall.tsx), тексты страниц раздаются
   TextsProvider'ом из корневого layout. */
export default function ShopLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
