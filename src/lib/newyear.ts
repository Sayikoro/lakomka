/* ============================================================
   Task 141: расчёт дней до Нового года — общие для сервера
   (запекание initialDays при сборке) и клиента (живой пересчёт
   после монтирования). Файл без "use client": функции может
   вызывать и серверный компонент, и клиентский.
   ============================================================ */

/** Дней до ближайшего 1 января (по переданным/локальным часам). */
export function daysUntilNewYear(now: Date = new Date()): number {
  const year = now.getFullYear();
  const ny = new Date(year + 1, 0, 1, 0, 0, 0, 0);
  const diffMs = ny.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / 86_400_000));
}

/** Русская плюрализация: 1 день / 2 дня / 5 дней. */
export function pluralDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "дня";
  return "дней";
}
