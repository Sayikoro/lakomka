import type { Product } from "./types";

/* Хелперы для URL с lakomkakhv.ru */
const wpu = (file: string) =>
  `https://lakomkakhv.ru/wp-content/uploads/2026/08/${file}`;

const candyPlaceholder = (label: string) =>
  `https://placehold.co/400x400/f5e6d3/7a4a1e.png?text=${encodeURIComponent(label)}`;

/* -------------------------------------------------- */
/* Конфеты — только наполнение, show_in_catalog = 0   */
/* -------------------------------------------------- */
const candies: Product[] = [
  {
    id: 1, sku: "candy-001", slug: "konfeta-mishka-v-lesu",
    name: "Конфета «Мишка в лесу»", type: "simple",
    price_kopecks: 0, old_price_kopecks: null,
    packaging_material: null, show_in_catalog: 0,
    media: [],
    images: [{ id: 101, url: candyPlaceholder("Мишка"), alt: "Мишка в лесу", sort_order: 0 }],
  },
  {
    id: 2, sku: "candy-002", slug: "konfeta-trufel",
    name: "Конфета «Трюфель»", type: "simple",
    price_kopecks: 0, old_price_kopecks: null,
    packaging_material: null, show_in_catalog: 0,
    media: [],
    images: [{ id: 102, url: candyPlaceholder("Трюфель"), alt: "Трюфель", sort_order: 0 }],
  },
  {
    id: 3, sku: "candy-003", slug: "konfeta-ptichye-moloko",
    name: "Конфета «Птичье молоко»", type: "simple",
    price_kopecks: 0, old_price_kopecks: null,
    packaging_material: null, show_in_catalog: 0,
    media: [],
    images: [{ id: 103, url: candyPlaceholder("Птичье"), alt: "Птичье молоко", sort_order: 0 }],
  },
  {
    id: 4, sku: "candy-004", slug: "karamel-barbaris",
    name: "Карамель «Барбарис»", type: "simple",
    price_kopecks: 0, old_price_kopecks: null,
    packaging_material: null, show_in_catalog: 0,
    media: [],
    images: [{ id: 104, url: candyPlaceholder("Барбарис"), alt: "Барбарис", sort_order: 0 }],
  },
  {
    id: 5, sku: "candy-005", slug: "marmelad-apelsin",
    name: "Мармелад «Апельсин»", type: "simple",
    price_kopecks: 0, old_price_kopecks: null,
    packaging_material: null, show_in_catalog: 0,
    media: [],
    images: [{ id: 105, url: candyPlaceholder("Мармелад"), alt: "Мармелад", sort_order: 0 }],
  },
];

/* -------------------------------------------------- */
/* Наборы и подарки — show_in_catalog = 1             */
/* -------------------------------------------------- */
const gifts: Product[] = [
  {
    id: 6, sku: "gift-advent", slug: "advent-kalendar",
    name: "Адвент-календарь", type: "bundle",
    price_kopecks: 285000, old_price_kopecks: 320000,
    packaging_material: "cardboard", show_in_catalog: 1,
    media: [],
    images: [
      { id: 201, url: wpu("LAM_015.png"), alt: "Адвент-календарь", sort_order: 0 },
      { id: 202, url: wpu("LA_047.png"),  alt: "Адвент-календарь — вид сзади", sort_order: 1 },
    ],
    bundle_items: [
      { id: 301, product_id: 6, component_id: 1, quantity: 5, component: candies[0] },
      { id: 302, product_id: 6, component_id: 2, quantity: 3, component: candies[1] },
      { id: 303, product_id: 6, component_id: 3, quantity: 4, component: candies[2] },
    ],
  },
  {
    id: 7, sku: "gift-newyear", slug: "nabor-novogodniy",
    name: "Подарочный набор «Новогодний»", type: "bundle",
    price_kopecks: 185000, old_price_kopecks: null,
    packaging_material: "tin", show_in_catalog: 1,
    media: [],
    images: [{ id: 203, url: wpu("N_002_1000x1000.png"), alt: "Новогодний набор", sort_order: 0 }],
    bundle_items: [
      { id: 304, product_id: 7, component_id: 2, quantity: 6, component: candies[1] },
      { id: 305, product_id: 7, component_id: 4, quantity: 8, component: candies[3] },
    ],
  },
  {
    id: 8, sku: "gift-lakomka", slug: "nabor-lakomka",
    name: "Набор «ЛАКОМКА»", type: "bundle",
    price_kopecks: 103000, old_price_kopecks: 120000,
    packaging_material: "cardboard", show_in_catalog: 1,
    media: [],
    images: [{ id: 204, url: wpu("KA_008.png"), alt: "Набор Лакомка", sort_order: 0 }],
    bundle_items: [
      { id: 306, product_id: 8, component_id: 1, quantity: 4, component: candies[0] },
      { id: 307, product_id: 8, component_id: 3, quantity: 3, component: candies[2] },
      { id: 308, product_id: 8, component_id: 5, quantity: 5, component: candies[4] },
    ],
  },
  {
    id: 9, sku: "gift-vip", slug: "nabor-vip",
    name: "Набор «ВИП»", type: "bundle",
    price_kopecks: 385000, old_price_kopecks: null,
    packaging_material: "textile", show_in_catalog: 1,
    media: [],
    images: [{ id: 205, url: wpu("KA_015.png"), alt: "Набор ВИП", sort_order: 0 }],
    bundle_items: [
      { id: 309, product_id: 9, component_id: 1, quantity: 8, component: candies[0] },
      { id: 310, product_id: 9, component_id: 2, quantity: 6, component: candies[1] },
      { id: 311, product_id: 9, component_id: 3, quantity: 6, component: candies[2] },
      { id: 312, product_id: 9, component_id: 4, quantity: 10, component: candies[3] },
    ],
  },
  {
    id: 10, sku: "gift-kids", slug: "nabor-dlya-detey",
    name: "Набор «Для детей»", type: "bundle",
    price_kopecks: 65000, old_price_kopecks: null,
    packaging_material: "cardboard", show_in_catalog: 1,
    media: [],
    images: [{ id: 206, url: wpu("KA_012_2.png"), alt: "Набор для детей", sort_order: 0 }],
    bundle_items: [
      { id: 313, product_id: 10, component_id: 4, quantity: 10, component: candies[3] },
      { id: 314, product_id: 10, component_id: 5, quantity: 8, component: candies[4] },
    ],
  },
  {
    id: 11, sku: "gift-tube", slug: "tubus-assorti",
    name: "Тубус «Ассорти»", type: "bundle",
    price_kopecks: 42000, old_price_kopecks: null,
    packaging_material: "tube", show_in_catalog: 1,
    media: [],
    images: [{ id: 207, url: wpu("KAM_038.png"), alt: "Тубус ассорти", sort_order: 0 }],
    bundle_items: [
      { id: 315, product_id: 11, component_id: 2, quantity: 6, component: candies[1] },
      { id: 316, product_id: 11, component_id: 5, quantity: 6, component: candies[4] },
    ],
  },
  {
    id: 12, sku: "gift-pouch", slug: "mesochek-assorti",
    name: "Мешочек «Ассорти»", type: "bundle",
    price_kopecks: 38000, old_price_kopecks: null,
    packaging_material: "pouch", show_in_catalog: 1,
    media: [],
    images: [{ id: 208, url: wpu("KA_101.png"), alt: "Мешочек ассорти", sort_order: 0 }],
    bundle_items: [
      { id: 317, product_id: 12, component_id: 1, quantity: 5, component: candies[0] },
      { id: 318, product_id: 12, component_id: 3, quantity: 5, component: candies[2] },
    ],
  },
  {
    id: 13, sku: "gift-mom", slug: "nabor-podarok-mame",
    name: "Набор «Подарок маме»", type: "bundle",
    price_kopecks: 120000, old_price_kopecks: null,
    packaging_material: "textile", show_in_catalog: 1,
    media: [],
    images: [{ id: 209, url: wpu("KA_023.png"), alt: "Подарок маме", sort_order: 0 }],
    bundle_items: [
      { id: 319, product_id: 13, component_id: 2, quantity: 5, component: candies[1] },
      { id: 320, product_id: 13, component_id: 5, quantity: 8, component: candies[4] },
    ],
  },
  {
    id: 14, sku: "set-tea", slug: "chaynyy-nabor-sibirskiy",
    name: "Чайный набор «Сибирский»", type: "simple",
    price_kopecks: 85000, old_price_kopecks: null,
    packaging_material: "cardboard", show_in_catalog: 1,
    media: [],
    images: [{ id: 210, url: wpu("LA_035.png"), alt: "Чайный набор", sort_order: 0 }],
  },
  {
    id: 15, sku: "set-samovar", slug: "samovar-suvenirnyy",
    name: "Самовар сувенирный", type: "simple",
    price_kopecks: 185000, old_price_kopecks: null,
    packaging_material: "cardboard", show_in_catalog: 1,
    media: [],
    images: [{ id: 211, url: wpu("LA_085.png"), alt: "Самовар", sort_order: 0 }],
  },
];

export const mockProducts: Product[] = [...candies, ...gifts];

export const mockCatalogProducts: Product[] = mockProducts.filter(
  (p) => p.show_in_catalog === 1,
);

export function findProductBySlug(slug: string): Product | undefined {
  return mockProducts.find((p) => p.slug === slug);
}

export const PACKAGING_LABELS: Record<string, string> = {
  cardboard: "Картон",
  tin: "Жесть",
  textile: "Текстиль",
  tube: "Туба",
  pouch: "Мешочек",
};

/* -------------------------------------------------- */
/* Категории — реальные фото с lakomkakhv.ru          */
/* -------------------------------------------------- */
export interface Category {
  slug: string;
  name: string;
  imageUrl: string;
}

export const mockCategories: Category[] = [
  { slug: "nabory",    name: "Наборы",      imageUrl: wpu("N_002_1000x1000.png") },
  { slug: "vip",       name: "ВИП подарки", imageUrl: wpu("KA_008.png") },
  { slug: "zhest",     name: "Жесть",       imageUrl: wpu("LA_085.png") },
  { slug: "igrushki",  name: "Игрушки",     imageUrl: wpu("KA_015.png") },
  { slug: "karton",    name: "Картон",      imageUrl: wpu("LA_035.png") },
  { slug: "meshochki", name: "Мешочки",     imageUrl: wpu("KA_101.png") },
  { slug: "tekstil",   name: "Текстиль",    imageUrl: wpu("KA_020.png") },
  { slug: "tuby",      name: "Тубы",        imageUrl: wpu("KAM_023.png") },
];

/* -------------------------------------------------- */
/* Бренды-производители                               */
/* -------------------------------------------------- */
export interface Brand {
  name: string;
  logoUrl: string;
}

export const mockBrands: Brand[] = [
  { name: "Конти",            logoUrl: wpu("konti_logo_1000x1000-300x300.png") },
  { name: "Мишкино",          logoUrl: wpu("Mishkino_logo-1_1000x1000-300x300.png") },
  { name: "Красный Октябрь",  logoUrl: wpu("Кр-Окт_1000x1000-300x300.png") },
  { name: "Невский кондитер", logoUrl: wpu("Невский-кондитер_лого_1000x1000-300x300.png") },
  { name: "Атаг",             logoUrl: wpu("атаг_лого_1000x1000-300x300.png") },
  { name: "Сладонеж",         logoUrl: wpu("сладонеж_1000x1000-300x300.png") },
  { name: "Рот Фронт",        logoUrl: wpu("РотФронт_1000x1000-300x300.png") },
  { name: "Бабаевский",       logoUrl: wpu("Бабаев_1000x1000-300x300.png") },
  { name: "Шок-Маг",          logoUrl: wpu("Logo_shok-mag_1000x1000-300x300.png") },
  { name: "КФС",              logoUrl: wpu("Logo_KFS_1000x1000-300x300.png") },
  { name: "Жако",             logoUrl: wpu("жако_1000x1000-300x300.png") },
  { name: "KDV",              logoUrl: wpu("KDV_logo_1000x1000-300x300.png") },
  { name: "АККонд",           logoUrl: wpu("акконд_лого_1000x1000-300x300.png") },
  { name: "Сладуница",        logoUrl: wpu("сладуница_лого_1000x1000-300x300.png") },
  { name: "Mars",             logoUrl: wpu("Mars_1000x1000-300x300.png") },
  { name: "SweetLife",        logoUrl: wpu("СвитЛайф_лого_1000x1000-300x300.png") },
  { name: "Бисквит",          logoUrl: wpu("bb_1000x1000-300x300.png") },
  { name: "СибБелка",         logoUrl: wpu("СибБелка_1000x1000-300x300.png") },
];

/* -------------------------------------------------- */
/* Иконки info-карточек и шагов процесса              */
/* -------------------------------------------------- */
export const mockIcons = {
  discount: wpu("ico-02-3.svg"),
  delivery: wpu("ico-04-3.svg"),
  payment:  wpu("ico-03-3.svg"),
  step1:    wpu("ico2_-02.svg"),
  step2:    wpu("ico2_-03.svg"),
  step3:    wpu("ico2_-04.svg"),
};
