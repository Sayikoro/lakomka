/* Кэш-режим серверных fetch-ов к PHP API.
 *
 * Dev-режим — "no-store": каждый рендер берёт живые данные.
 *
 * EXPORT_MODE=1 (статическая сборка для деплоя, см. scripts/build-static.sh)
 * — "force-cache": Next 16 запрещает no-store fetch внутри рендера страниц
 * при output: export (роут помечается dynamic = "error" и fetch бросает
 * исключение — данные не запекаются). С force-cache каждый URL скачивается
 * при сборке один раз и результат «запекается» в статические страницы. */
export const FETCH_CACHE = process.env.EXPORT_MODE === "1"
  ? ("force-cache" as const)
  : ("no-store" as const);
