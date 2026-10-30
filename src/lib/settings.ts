import { cache } from "react";
import type { Product } from "./types";
import { DEFAULT_SNOW_SETTINGS, parseSnowConfig } from "./snow";
import type { SnowSettings } from "./snow";

export type { SnowSettings };
export { DEFAULT_SNOW_SETTINGS };

const API_URL = process.env.PHP_API_URL ?? "http://localhost:8000/api";

import { FETCH_CACHE } from "./fetch-cache";

/* ============================================================
   Витринные настройки (управляются в админке → Настройки)
   ============================================================ */

export interface HeroSlide {
  url: string;
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

/* Дефолты и парсер снегопада живут в ./snow (общие с клиентскими
   компонентами — Hero подтягивает свежий конфиг на статическом сайте). */

export const DEFAULT_FRONT_SETTINGS: ShopFrontSettings = {
  hero_image: "/hero-bg.jpg",
  hero_slider_enabled: false,
  hero_slides: [],
  product_card_template: "new",
  snow: DEFAULT_SNOW_SETTINGS,
  texts: {},
};

interface ApiPublicSettings {
  hero_image?: string;
  hero_slider_enabled?: boolean;
  hero_slides?: HeroSlide[];
  product_card_template?: string;
  snow?: Parameters<typeof parseSnowConfig>[0];
  texts?: Record<string, unknown>;
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
    const res = await fetch(`${API_URL}/settings/public`, { cache: FETCH_CACHE });
    if (!res.ok) return DEFAULT_FRONT_SETTINGS;
    const json = (await res.json()) as { data: ApiPublicSettings };
    const d = json.data ?? {};
    /* Дефолт — «new» (карточка с кнопками «Перейти»+«В корзину»): так предпочитает
       владелец; классический шаблон включается явным выбором в админке. Если ключ
       в БД потерялся (пересоздание контейнера и т.п.) — витрина не деградирует. */
    const template =
      d.product_card_template === "classic" ? "classic" as const : "new" as const;
    return {
      hero_image: d.hero_image || DEFAULT_FRONT_SETTINGS.hero_image,
      hero_slider_enabled: Boolean(d.hero_slider_enabled),
      hero_slides: Array.isArray(d.hero_slides)
        ? d.hero_slides.filter((s) => s && typeof s.url === "string" && s.url)
        : [],
      product_card_template: template,
      snow: parseSnowConfig(d.snow),
      texts: parseTexts(d.texts),
    };
  } catch {
    return DEFAULT_FRONT_SETTINGS;
  }
});
