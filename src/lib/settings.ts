import { cache } from "react";
import type { Product } from "./types";

const API_URL = process.env.PHP_API_URL ?? "http://localhost:8000/api";

/* ============================================================
   Витринные настройки (управляются в админке → Настройки)
   ============================================================ */

export interface HeroSlide {
  url: string;
}

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

export interface ShopFrontSettings {
  /** Основная картинка hero (если слайдер выключен — она одна на фоне) */
  hero_image: string;
  /** Включён ли перелистываемый слайдер */
  hero_slider_enabled: boolean;
  /** Слайды слайдера */
  hero_slides: HeroSlide[];
  /** Шаблон карточки товара в каталоге: classic | new */
  product_card_template: "classic" | "new";
  /** Снегопад */
  snow: SnowSettings;
  /** Тексты страниц («Текст на страницах»): ключ из реестра → значение;
      отсутствие ключа или пустая строка = дефолт из реестра page-texts.ts */
  texts: Record<string, string>;
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

export const DEFAULT_FRONT_SETTINGS: ShopFrontSettings = {
  hero_image: "/hero-bg.jpg",
  hero_slider_enabled: false,
  hero_slides: [],
  product_card_template: "classic",
  snow: DEFAULT_SNOW_SETTINGS,
  texts: {},
};

interface ApiSnowSettings {
  enabled?: boolean;
  count?: number;
  count_mobile?: number;
  speed?: number;
  size?: number;
  color?: string;
  flake?: string;
}

interface ApiPublicSettings {
  hero_image?: string;
  hero_slider_enabled?: boolean;
  hero_slides?: HeroSlide[];
  product_card_template?: string;
  snow?: ApiSnowSettings;
  texts?: Record<string, unknown>;
}

function parseSnow(d: ApiSnowSettings | undefined): SnowSettings {
  const s = d ?? {};
  return {
    enabled: Boolean(s.enabled),
    count: typeof s.count === "number" && Number.isFinite(s.count)
      ? Math.max(0, Math.min(500, Math.round(s.count)))
      : DEFAULT_SNOW_SETTINGS.count,
    count_mobile: typeof s.count_mobile === "number" && Number.isFinite(s.count_mobile)
      ? Math.max(0, Math.min(500, Math.round(s.count_mobile)))
      : DEFAULT_SNOW_SETTINGS.count_mobile,
    speed: typeof s.speed === "number" && Number.isFinite(s.speed)
      ? Math.max(0.1, Math.min(20, s.speed))
      : DEFAULT_SNOW_SETTINGS.speed,
    size: typeof s.size === "number" && Number.isFinite(s.size)
      ? Math.max(4, Math.min(120, Math.round(s.size)))
      : DEFAULT_SNOW_SETTINGS.size,
    color: typeof s.color === "string" && /^#[0-9a-fA-F]{6}$/.test(s.color)
      ? s.color
      : DEFAULT_SNOW_SETTINGS.color,
    flake: typeof s.flake === "string" ? s.flake : "",
  };
}

function parseTexts(d: Record<string, unknown> | undefined): Record<string, string> {
  if (!d || typeof d !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

/* cache(): layout и страница в одном запросе рендерятся один раз —
   дедупликация no-store fetch в рамках одного HTTP-запроса Next */
export const getPublicSettings = cache(async function (): Promise<ShopFrontSettings> {
  try {
    const res = await fetch(`${API_URL}/settings/public`, { cache: "no-store" });
    if (!res.ok) return DEFAULT_FRONT_SETTINGS;
    const json = (await res.json()) as { data: ApiPublicSettings };
    const d = json.data ?? {};
    const template =
      d.product_card_template === "new" ? "new" as const : "classic" as const;
    return {
      hero_image: d.hero_image || DEFAULT_FRONT_SETTINGS.hero_image,
      hero_slider_enabled: Boolean(d.hero_slider_enabled),
      hero_slides: Array.isArray(d.hero_slides)
        ? d.hero_slides.filter((s) => s && typeof s.url === "string" && s.url)
        : [],
      product_card_template: template,
      snow: parseSnow(d.snow),
      texts: parseTexts(d.texts),
    };
  } catch {
    return DEFAULT_FRONT_SETTINGS;
  }
});
