/* ============================================================
   Task 139: «Недавно смотрели» — локальная история просмотров.

   Хранится ТОЛЬКО в localStorage браузера (никаких куки и
   персональных данных, регистрация не нужна): упорядоченный
   список slug'ов, самый свежий первым, максимум 12 позиций.

   Каталог читает список после монтирования и сопоставляет
   slug'и с живым каталогом — блок «Недавно смотрели» показывается
   в сайдбаре под фильтрами (xl+), на телефоне/планшете — внизу.
   ============================================================ */

const KEY = "lk_recent";
const MAX = 12;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

/** Список просмотренных slug'ов, самый свежий первым. */
export function getRecentlyViewed(): string[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s): s is string => typeof s === "string" && s.length > 0)
      .slice(0, MAX);
  } catch {
    return [];
  }
}

/** Запомнить просмотр карточки: наверх списка, без дублей, максимум 12. */
export function recordRecentlyViewed(slug: string): void {
  if (!isBrowser() || !slug) return;
  try {
    const prev = getRecentlyViewed().filter((s) => s !== slug);
    localStorage.setItem(KEY, JSON.stringify([slug, ...prev].slice(0, MAX)));
  } catch {
    /* приватный режим без localStorage — истории нет, магазин работает */
  }
}
