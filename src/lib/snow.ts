/* Настройки снегопада: общий модуль для серверного рендера и клиентских
 * компонентов (Hero сам подтягивает свежий конфиг с /api/settings/public —
 * на статическом деплое без этого снег «запекается» в HTML при сборке). */

export interface SnowSettings {
  /** Включён ли снегопад (в Hero-блоке на главной) */
  enabled: boolean;
  /** Количество снежинок на компьютерах (плотность) */
  count: number;
  /** Количество снежинок на телефонах/планшетах (< 768px) */
  count_mobile: number;
  /** Скорость падения (множитель) */
  speed: number;
  /** Базовый размер снежинки, px */
  size: number;
  /** Цвет снежинки, hex */
  color: string;
  /** URL своей SVG-снежинки (пусто — встроенная) */
  flake: string;
}

/* Дефолты снега — как в оригинальном particle-fall: 110 / 0.5 / 31 / #f5f5f5.
   Для телефонов плотность по умолчанию ниже — экран меньше. */
export const DEFAULT_SNOW_SETTINGS: SnowSettings = {
  enabled: false,
  count: 110,
  count_mobile: 60,
  speed: 0.5,
  size: 31,
  color: "#f5f5f5",
  flake: "",
};

interface ApiSnowSettings {
  enabled?: boolean | string | number;
  count?: number | string;
  count_mobile?: number | string;
  speed?: number | string;
  size?: number | string;
  color?: string;
  flake?: string;
}

/** Терпеливый разбор конфига снега: сервер отдаёт числа/булеаны,
 *  но старые сборки/кэши могут отдавать строки — приводим всё сами. */
export function parseSnowConfig(d: ApiSnowSettings | undefined | null): SnowSettings {
  const s = d ?? {};
  const num = (v: unknown, def: number, min: number, max: number, round = false) => {
    const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
    if (!Number.isFinite(n)) return def;
    const c = Math.max(min, Math.min(max, n));
    return round ? Math.round(c) : c;
  };
  return {
    enabled:
      s.enabled === true ||
      s.enabled === 1 ||
      String(s.enabled ?? "").toLowerCase() === "1" ||
      String(s.enabled ?? "").toLowerCase() === "true",
    count: num(s.count, DEFAULT_SNOW_SETTINGS.count, 0, 500, true),
    count_mobile: num(s.count_mobile, DEFAULT_SNOW_SETTINGS.count_mobile, 0, 500, true),
    speed: num(s.speed, DEFAULT_SNOW_SETTINGS.speed, 0.1, 20),
    size: num(s.size, DEFAULT_SNOW_SETTINGS.size, 4, 120, true),
    color:
      typeof s.color === "string" && /^#[0-9a-fA-F]{6}$/.test(s.color)
        ? s.color
        : DEFAULT_SNOW_SETTINGS.color,
    flake: typeof s.flake === "string" ? s.flake : "",
  };
}
