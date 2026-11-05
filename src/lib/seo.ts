import type { Metadata } from "next";

/* ============================================================
   Task 147: SEO-модуль семантического ядра (Хабаровск).

   Ядро разбито на кластеры, каждый закреплён за своей
   посадочной:
   • кластер 1 (основные коммерческие)  — главная;
   • кластер 2 (детские)                — /detskie;
   • кластер 3 (корпоративные, B2B)     — /corporate;
   • кластер 4 (оптовые, B2B)           — /wholesale;
   • кластер 5 (продуктовые)            — категории /catalog/<slug>;
   • кластер 6 (доставка/цена)          — /delivery.

   Здесь живут общие хелперы: карта SEO-фраз категорий
   (используется автогенерацией метаданных и H1, когда владелец
   не заполнил поля в админке) и конструктор метаданных
   статических страниц. Содержательное — тексты страниц.
   ============================================================ */

export interface CategorySeo {
  /** Человеческая фраза-заголовок (H1 и основа title) */
  phrase: string;
  /** Дополнительное уточнение в description (естественное вхождение) */
  extra: string;
}

/**
 * Продуктовые фразы категорий (кластер 5) для известных слагов.
 * Ключ — slug категории из БД. Незнакомый слаг (владелец завёл новую
 * категорию) — общий шаблон с названием категории.
 */
export const CATEGORY_SEO: Record<string, CategorySeo> = {
  nabory: {
    phrase: "Подарочные наборы конфет",
    extra: "подарочные и новогодние наборы конфет",
  },
  vip: {
    phrase: "VIP-подарки",
    extra: "премиальные VIP-наборы к Новому году",
  },
  zhest: {
    phrase: "Подарки в жестяных банках",
    extra: "новогодние сладкие подарки в жестяной упаковке",
  },
  igrushki: {
    phrase: "Новогодние подарки с игрушками",
    extra: "детские сладкие подарки с игрушкой",
  },
  karton: {
    phrase: "Подарки в картонных коробках",
    extra: "сладкие наборы в картонной упаковке",
  },
  meshochki: {
    phrase: "Подарки в мешочках",
    extra: "новогодние подарки в текстильном мешочке",
  },
  tekstil: {
    phrase: "Подарки в текстильной упаковке",
    extra: "сладкие подарки в мягкой текстильной упаковке",
  },
  tuby: {
    phrase: "Подарки в тубах",
    extra: "новогодние наборы конфет в тубе",
  },
};

/**
 * SEO-метаданные категории: заполненные в админке поля приоритетны,
 * пустые — автогенерация из карты выше (или общий шаблон).
 */
export function categorySeo(cat: {
  slug: string;
  name: string;
  meta_title?: string | null;
  meta_description?: string | null;
}): { h1: string; title: string; description: string } {
  const map = CATEGORY_SEO[cat.slug];
  const phrase = map?.phrase ?? cat.name;

  const title =
    /* Бренд добавит title-template корневого layout (« — Лакомка»),
       поэтому здесь без «| Лакомка» — иначе дубль в <title> */
    cat.meta_title?.trim() || `${phrase} — купить в Хабаровске`;

  const description =
    cat.meta_description?.trim() ||
    `${phrase} с доставкой по Хабаровску. ${map?.extra ?? cat.name} — собственное производство «Лакомки», конфеты известных фабрик. Заказ по телефону или на сайте.`;

  return { h1: phrase, title, description };
}

/**
 * Конструктор метаданных статических SEO-страниц:
 * title через общий шаблон (добавит « — Лакомка»), canonical,
 * openGraph. description задаётся страницей целиком.
 */
export function staticPageMetadata(opts: {
  /** Заголовок вкладки/поиска (без « — Лакомка», добавит template) */
  title: string;
  description: string;
  /** Канонический путь, например "/corporate" */
  path: string;
}): Metadata {
  return {
    title: opts.title,
    description: opts.description,
    alternates: { canonical: opts.path },
    openGraph: {
      title: opts.title,
      description: opts.description,
      url: opts.path,
    },
  };
}
