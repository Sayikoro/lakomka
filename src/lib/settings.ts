import { cache } from "react";
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
  /** Показывать видео в карточке каталога (много видео = тяжёлая страница) */
  card_video_enabled: boolean;
  /** Яндекс.Метрика: номер счётчика; пусто = счётчик не вшит (Task 107) */
  ym_id: string;
  /** Встраиваемый блок Метрики целиком (Task 114); пусто = блока нет.
      Задан — используется вместо ym_id. */
  metrika_code: string;
  /** Снегопад */
  snow: SnowSettings;
  /** Task 141: счётчик «До Нового года» на главной (под hero) */
  newyear_counter_enabled: boolean;
  /** Task 141: быстрый просмотр товара из каталога (модалка) */
  quick_view_enabled: boolean;
  /** Тексты страниц («Текст на страницах»): ключ из реестра → значение;
      отсутствие ключа или пустая строка = дефолт из реестра page-texts.ts */
  texts: Record<string, string>;
}

/* Дефолты и парсер снегопада живут в ./snow (общие с клиентскими
   компонентами — Hero подтягивает свежий конфиг на статическом сайте). */

export const DEFAULT_FRONT_SETTINGS: ShopFrontSettings = {
  hero_image: "/hero-bg.webp",
  hero_slider_enabled: false,
  hero_slides: [],
  product_card_template: "new",
  /* Task 138: видео в карточках по умолчанию ВЫКЛЮЧЕНО — у 165 из 271 товаров
     есть видео-медиа, каждая карточка с видео монтирует <video> и браузер
     начинает качать файлы сразу при открытии каталога (Safari — особенно
     агрессивно). Владелец держит галочку выключенной на проде. */
  card_video_enabled: false,
  ym_id: "",
  metrika_code: "",
  snow: DEFAULT_SNOW_SETTINGS,
  /* Task 141: обе фичи по умолчанию включены — владелец отключает галочкой */
  newyear_counter_enabled: true,
  quick_view_enabled: true,
  texts: {},
};

interface ApiPublicSettings {
  hero_image?: string;
  hero_slider_enabled?: boolean;
  hero_slides?: HeroSlide[];
  product_card_template?: string;
  card_video_enabled?: boolean;
  ym_id?: string;
  metrika_code?: string;
  snow?: Parameters<typeof parseSnowConfig>[0];
  newyear_counter_enabled?: boolean;
  quick_view_enabled?: boolean;
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
      /* Task 138: видео в карточках включается ТОЛЬКО явной галочкой в админке
         (true в API). Отсутствие ключа/битое значение = выключено — витрина
         не должна качать видео, пока владелец сам их не включит. */
      card_video_enabled: d.card_video_enabled === true,
      /* Счётчик Метрики: бэкенд отдаёт только валидные цифры или пусто */
      ym_id: typeof d.ym_id === "string" ? d.ym_id : "",
      /* Встраиваемый блок Метрики (Task 114) — бэкенд отдаёт как есть */
      metrika_code: typeof d.metrika_code === "string" ? d.metrika_code : "",
      snow: parseSnowConfig(d.snow),
      /* Task 141: по умолчанию включены (ключа нет в БД — фича работает) */
      newyear_counter_enabled: d.newyear_counter_enabled !== false,
      quick_view_enabled: d.quick_view_enabled !== false,
      texts: parseTexts(d.texts),
    };
  } catch {
    return DEFAULT_FRONT_SETTINGS;
  }
});
