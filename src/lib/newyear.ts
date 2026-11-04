/* ============================================================
   Расчёт времени до Нового года — общие для сервера (запекание
   стартовых значений при сборке) и клиента (живой пересчёт после
   монтирования). Файл без "use client": функции может вызывать
   и серверный компонент, и клиентский.

   Task 141: daysUntilNewYear + pluralDays (полоска с числом дней).
   Task 142: редизайн блока в хрониометр — добавлены
   timeUntilNewYearParts (дни/часы/минуты/секунды до полуночи
   1 января, floor-математика живого отсчёта) и pluralPick
   (универсальная плюрализация для подписей карточек).
   ============================================================ */

export interface NyParts {
  d: number;
  h: number;
  m: number;
  s: number;
}

/** Полночь ближайшего 1 января (по переданным/локальным часам). */
export function newyearMidnight(now: Date = new Date()): Date {
  return new Date(now.getFullYear() + 1, 0, 1, 0, 0, 0, 0);
}

/** Дней до ближайшего 1 января (по переданным/локальным часам). */
export function daysUntilNewYear(now: Date = new Date()): number {
  const diffMs = newyearMidnight(now).getTime() - now.getTime();
  return Math.max(0, Math.ceil(diffMs / 86_400_000));
}

/**
 * Части живого отсчёта до полуночи 1 января: дни/часы/минуты/секунды.
 * floor-математика канонического таймера: «осталось 56 дней 14 часов»,
 * в отличие от daysUntilNewYear (ceil — календарных дней осталось).
 */
export function timeUntilNewYearParts(now: Date = new Date()): NyParts {
  const diffMs = Math.max(0, newyearMidnight(now).getTime() - now.getTime());
  return {
    d: Math.floor(diffMs / 86_400_000),
    h: Math.floor(diffMs / 3_600_000) % 24,
    m: Math.floor(diffMs / 60_000) % 60,
    s: Math.floor(diffMs / 1_000) % 60,
  };
}

/**
 * Русская плюрализация по трём формам: pluralPick(5, ["день","дня","дней"])
 * → «дней», pluralPick(2, …) → «дня». Правило: 1/21/101 → одна,
 * 2–4/22–24 → две-четыре, остальные → многие (с оговоркой 11–14).
 */
export function pluralPick(
  n: number,
  forms: [string, string, string]
): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

/** Русская плюрализация дней: 1 день / 2 дня / 5 дней. */
export function pluralDays(n: number): string {
  return pluralPick(n, ["день", "дня", "дней"]);
}
