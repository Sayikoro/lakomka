import type { Product } from "./types";

const API_URL = process.env.PHP_API_URL ?? "http://localhost:8000/api";

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
}

export const DEFAULT_FRONT_SETTINGS: ShopFrontSettings = {
  hero_image: "/hero-bg.jpg",
  hero_slider_enabled: false,
  hero_slides: [],
  product_card_template: "classic",
};

interface ApiPublicSettings {
  hero_image?: string;
  hero_slider_enabled?: boolean;
  hero_slides?: HeroSlide[];
  product_card_template?: string;
}

export async function getPublicSettings(): Promise<ShopFrontSettings> {
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
    };
  } catch {
    return DEFAULT_FRONT_SETTINGS;
  }
}
