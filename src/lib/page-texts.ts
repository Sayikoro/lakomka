/* ============================================================
   Реестр текстов страниц («Настройки → Текст на страницах»).

   Каждая страница витрины объявлена здесь со списком текстовых
   полей: заголовки, подписи, надписи на кнопках, описания.
   Значения хранятся в таблице settings под ключами text_<key>.
   Пустое значение в админке = используется дефолт (def) —
   так сайт остаётся «самодостаточным» при переносе на другой
   проект: достаточно поменять только нужные строки.

   Подстановки: {year} — текущий год, {n} — найдено товаров,
   {total} — всего товаров. Добавляются функцией rt().

   Чтобы добавить поле: объявите его здесь и подставьте в
   компоненте через useT()/tFrom() (клиентские) или tFrom()
   (серверные, cfg.texts). Всё остальное — сохранение в админке,
   API и хранение — универсально.
   ============================================================ */

export interface TextDef {
  /** Ключ (без префикса text_); префикс добавляется при хранении */
  key: string;
  /** Название поля в админке */
  label: string;
  /** Текст по умолчанию */
  def: string;
  /** Многострочное поле (textarea) */
  area?: boolean;
  /** Подсказка под полем */
  hint?: string;
}

export interface PageTextsDef {
  id: string;
  title: string;
  texts: TextDef[];
}

export const TEXT_PREFIX = "text_";

export const PAGE_TEXTS: PageTextsDef[] = [
  {
    id: "global",
    title: "Хедер и футер (везде)",
    texts: [
      // global_brand (название в шапке) удалён: в шапке теперь логотип-картинка
      { key: "global_nav_gifts", label: "Пункт меню — Подарки", def: "Подарки" },
      { key: "global_nav_catalogs", label: "Пункт меню — Скачать каталоги", def: "Скачать каталоги" },
      { key: "global_menu_title", label: "Заголовок бургер-меню", def: "Меню" },
      { key: "global_contact_button", label: "Кнопка «Связаться с нами»", def: "Связаться с нами" },
      { key: "global_contact_reply", label: "Подпись под кнопкой контакта", def: "Ответим в рабочее время" },
      { key: "global_footer_company", label: "Футер — строка компании ({year} = год)", def: "ООО Компания «Лакомка», 2015 – {year}" },
      { key: "global_footer_inn", label: "Футер — ИНН", def: "ИНН 2724199105" },
      { key: "global_footer_ogrn", label: "Футер — ОГРН", def: "ОГРН 1152724000978" },
      { key: "global_footer_address_label", label: "Футер — подпись адреса", def: "Юридический адрес:" },
      { key: "global_footer_address", label: "Футер — адрес", area: true, def: "680031, Хабаровский край, город Хабаровск, ул. Карла Маркса, д. 186б" },
      { key: "global_footer_phone1", label: "Футер — телефон 1", def: "+7 (4212) 78 96 21" },
      { key: "global_footer_phone2", label: "Футер — телефон 2", def: "+7 914 158 24 64" },
      { key: "global_footer_certificate", label: "Футер — ссылка на сертификат", def: "Сертификат соответствия" },
      { key: "global_footer_privacy", label: "Футер — ссылка на политику", def: "Политика конфиденциальности" },
      { key: "global_footer_view_catalogs", label: "Футер — кнопка «Посмотреть каталоги»", def: "Посмотреть каталоги" },
      { key: "global_footer_download_catalogs", label: "Футер — ссылка «Скачать каталоги»", def: "Скачать каталоги" },
      { key: "global_footer_credits_prefix", label: "Футер — «Сделано …»", def: "Сделано" },
      { key: "global_footer_credits_name", label: "Футер — имя студии", def: "ShabanOFF Design" },
    ],
  },
  {
    id: "home",
    title: "Главная",
    texts: [
      { key: "home_hero_line1", label: "Hero — строка 1", def: "новогодняя" },
      { key: "home_hero_line2", label: "Hero — строка 2", def: "коллекция" },
      { key: "home_hero_line3", label: "Hero — строка 3 (год)", def: "2027" },
      { key: "home_hero_button", label: "Hero — кнопка", def: "Заказать подарки" },
      { key: "home_info1_title", label: "Плитка 1 — заголовок", def: "СКИДКА" },
      { key: "home_info1_sub", label: "Плитка 1 — подпись", def: "Условия скидки" },
      { key: "home_info2_title", label: "Плитка 2 — заголовок", def: "ДОСТАВКА" },
      { key: "home_info2_sub", label: "Плитка 2 — подпись", def: "Условия доставки" },
      { key: "home_info3_title", label: "Плитка 3 — заголовок", def: "ОПЛАТА" },
      { key: "home_info3_sub", label: "Плитка 3 — подпись", def: "Условия оплаты" },
      { key: "home_step1_title", label: "Шаг 1 — заголовок", def: "Выберите подарки" },
      { key: "home_step1_text", label: "Шаг 1 — текст", area: true, def: "Добавьте наборы в корзину и оформите заказ на сайте." },
      { key: "home_step2_title", label: "Шаг 2 — заголовок", def: "Менеджер свяжется" },
      { key: "home_step2_text", label: "Шаг 2 — текст", area: true, def: "В рабочее время подтвердим состав, согласуем оплату и доставку." },
      { key: "home_step3_title", label: "Шаг 3 — заголовок", def: "Получите заказ" },
      { key: "home_step3_text", label: "Шаг 3 — текст", area: true, def: "Доставим в согласованное время по Хабаровску или отправим ТК." },
      { key: "home_process_heading", label: "Блок процесса — заголовок", def: "Процесс оформления и обработки заказа" },
      { key: "home_brands_heading", label: "Блок фабрик — заголовок", def: "В наших подарках конфеты от фабрик" },
    ],
  },
  {
    id: "catalog",
    title: "Каталог",
    texts: [
      { key: "catalog_h1", label: "Заголовок страницы", def: "Подарки" },
      { key: "catalog_empty_title", label: "Пустой каталог — заголовок", def: "В каталоге пока ничего нет" },
      { key: "catalog_search_label", label: "Фильтр — Поиск", def: "Поиск" },
      { key: "catalog_search_placeholder", label: "Фильтр — плейсхолдер поиска", def: "Название подарка" },
      { key: "catalog_category_label", label: "Фильтр — Категория", def: "Категория" },
      { key: "catalog_all", label: "Фильтр — плитка «Все»", def: "Все" },
      { key: "catalog_weight_label", label: "Фильтр — Вес", def: "Вес" },
      { key: "catalog_price_label", label: "Фильтр — Цена", def: "Цена" },
      { key: "catalog_reset", label: "Кнопка сброса фильтров", def: "Сбросить фильтры" },
      { key: "catalog_pages", label: "Счётчик страниц ({page} и {pages} — числа)", def: "Страница {page} из {pages}" },
      { key: "catalog_sort_label", label: "Надпись «Сортировка:»", def: "Сортировка:" },
      { key: "catalog_empty_result", label: "Пустой результат фильтров", def: "Ничего не нашлось. Попробуйте изменить фильтры." },
    ],
  },
  {
    id: "catalogs",
    title: "Скачать каталоги",
    texts: [
      { key: "catalogs_h1", label: "Заголовок страницы", def: "Скачать каталоги" },
      { key: "catalogs_intro", label: "Описание под заголовком", area: true, def: "Наши печатные каталоги в электронном виде. Нажмите «Смотреть», чтобы полистать страницы прямо на сайте — как настоящую книгу, — или скачайте PDF-файл. Там же доступен сертификат соответствия продукции." },
      { key: "catalogs_card1_desc", label: "Каталог №1 — описание", area: true, hint: "Используется, если в разделе «PDF» не заполнено своё описание.", def: "Печатный каталог сладких подарков — полистайте как книгу или скачайте PDF, чтобы распечатать и отправить коллегам." },
      { key: "catalogs_card2_desc", label: "Каталог №2 — описание", area: true, hint: "Используется, если в разделе «PDF» не заполнено своё описание.", def: "Второй печатный каталог с ассортиментом подарков — с эффектом перелистывания страниц и возможностью скачивания." },
      { key: "catalogs_cert_desc", label: "Сертификат — описание", area: true, hint: "Используется, если в разделе «PDF» не заполнено своё описание.", def: "Декларация/сертификат соответствия продукции требованиям ТР ТС — открывается в том же вьювере, доступен для скачивания." },
    ],
  },
  {
    id: "cart",
    title: "Корзина",
    texts: [
      { key: "cart_h1", label: "Заголовок", def: "Корзина" },
      { key: "cart_empty_h1", label: "Пустая корзина — заголовок", def: "Корзина пуста" },
      { key: "cart_empty_text", label: "Пустая корзина — текст", def: "Добавьте подарки из каталога, чтобы оформить заказ." },
      { key: "cart_empty_btn", label: "Пустая корзина — кнопка", def: "Перейти в каталог" },
      { key: "cart_per_item", label: "Подпись цены за штуку", def: "за шт." },
      { key: "cart_clear", label: "Кнопка очистки", def: "Очистить корзину" },
      { key: "cart_total_label", label: "Надпись «Итого»", def: "Итого" },
      { key: "cart_checkout_btn", label: "Кнопка оформления", def: "Оформить заказ" },
    ],
  },
  {
    id: "checkout",
    title: "Оформление заказа",
    texts: [
      { key: "checkout_h1", label: "Заголовок", def: "Оформление заказа" },
      { key: "checkout_empty_h1", label: "Пустая корзина — заголовок", def: "Корзина пуста" },
      { key: "checkout_empty_text", label: "Пустая корзина — текст", def: "Добавьте товары, чтобы оформить заказ." },
      { key: "checkout_empty_btn", label: "Пустая корзина — кнопка", def: "Перейти в каталог" },
      { key: "checkout_name_label", label: "Поле — Имя", def: "Имя *" },
      { key: "checkout_phone_label", label: "Поле — Телефон", def: "Телефон *" },
      { key: "checkout_phone_placeholder", label: "Телефон — плейсхолдер", def: "+7 (999) 000-00-00" },
      { key: "checkout_email_label", label: "Поле — Email", def: "Email" },
      { key: "checkout_email_placeholder", label: "Email — плейсхолдер", def: "для отправки копии заказа" },
      { key: "checkout_delivery_label", label: "Поле — Способ доставки", def: "Способ доставки *" },
      { key: "checkout_dlv_pickup", label: "Доставка — Самовывоз", def: "Самовывоз" },
      { key: "checkout_dlv_city", label: "Доставка — По городу", def: "По Хабаровску" },
      { key: "checkout_dlv_region", label: "Доставка — За городом", def: "За городом" },
      { key: "checkout_dlv_tk", label: "Доставка — ТК", def: "Транспортной компанией" },
      { key: "checkout_address_label", label: "Поле — Адрес", def: "Адрес *" },
      { key: "checkout_comment_label", label: "Поле — Комментарий", def: "Комментарий" },
      { key: "checkout_comment_placeholder", label: "Комментарий — плейсхолдер", def: "Например: позвонить за час" },
      { key: "checkout_submit", label: "Кнопка отправки", def: "Оформить заказ" },
      { key: "checkout_submitting", label: "Кнопка во время отправки", def: "Отправляем…" },
    ],
  },
  {
    id: "product",
    title: "Карточка товара",
    texts: [
      { key: "product_add", label: "Кнопка «В корзину»", def: "В корзину" },
      { key: "product_added", label: "Кнопка после добавления", def: "Добавлено ✓" },
      { key: "product_tab_description", label: "Вкладка «Описание»", def: "Описание" },
      { key: "product_tab_details", label: "Вкладка «Детали»", def: "Детали" },
      { key: "product_tabs_composition", label: "Вкладка «Состав подарка»", def: "Состав подарка" },
    ],
  },
  {
    id: "privacy",
    title: "Политика конфиденциальности",
    texts: [
      { key: "privacy_h1", label: "Заголовок", def: "Политика конфиденциальности" },
      { key: "privacy_since", label: "Подзаголовок «Действует с …»", def: "Действует с 1 января 2026 года" },
      { key: "privacy_breadcrumb", label: "Хлебная крошка", def: "Политика конфиденциальности" },
    ],
  },
];

/** Все ключи реестра (без префикса) */
export const ALL_TEXT_KEYS: string[] = PAGE_TEXTS.flatMap((p) =>
  p.texts.map((t) => t.key)
);

/** Подстановки переменных {x} в текст */
function applyVars(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name) =>
    name in vars ? String(vars[name]) : m
  );
}

/**
 * Достать текст: сохранённое значение (непустое) → иначе дефолт.
 * Для клиентских компонентов используйте useT(), для серверных —
 * tFrom(cfg.texts, ...).
 */
export function tFrom(
  texts: Record<string, string> | undefined,
  key: string,
  vars?: Record<string, string | number>
): string {
  const v = texts?.[key];
  const base = typeof v === "string" && v.trim() !== "" ? v : "";
  if (!base) {
    // дефолт ищем в реестре
    for (const page of PAGE_TEXTS) {
      const def = page.texts.find((t) => t.key === key);
      if (def) return applyVars(def.def, vars);
    }
    return key;
  }
  return applyVars(base, vars);
}
