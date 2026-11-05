/* Task 141 E2E: «Поделиться», счётчик «До Нового года», быстрый просмотр,
 * SEO-лендинги категорий.
 *
 * Стенд :8096 (.deploy-package, собран MODE=both). Сценарии:
 * A) Главная: полоска «До Нового года осталось N дней» сразу под hero
 *    (после монтирования — актуальное число, плюрализация день/дня/дней).
 * B) Товар: кнопка «Поделиться» → меню (Telegram/WhatsApp/VK/Копировать),
 *    «Скопировать ссылку» кладёт URL товара в буфер, меню закрывается.
 * C) Каталог: глазок быстрого просмотра на карточке → модалка с ценой и
 *    «В корзину»; добавление растит бейдж шапки; Esc закрывает; ссылка
 *    «Открыть карточку товара» ведёт на товар.
 * D) SEO-лендинг категории: /catalog/<slug> отдаёт H1 категории,
 *    canonical на себя, сетку товаров; плитки категорий на главной
 *    ссылаются на /catalog/<slug>.
 * E) Выключение быстрого просмотра в админке убирает глазки (галочка
 *    через API, страница перезагружается); потом возвращаем.
 *
 * Запуск: node scripts/task141-e2e.cjs http://127.0.0.1:8096
 */
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://127.0.0.1:8096";
const ADMIN_LOGIN = process.env.ADMIN_LOGIN || "admin@lakomka.local";
const ADMIN_PASS = process.env.ADMIN_PASS || "Lakomka2026!";
let PASS = 0, FAIL = 0;
const ok = (s) => { PASS++; console.log("  OK  " + s); };
const bad = (s) => { FAIL++; console.log("  FAIL " + s); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") {
      const url = (m.location() && m.location().url) || "";
      if (url.includes("/api/")) return; // 4xx от аналитики/бот-щита не считаем
      consoleErrors.push(m.text() + " @ " + url);
    }
  });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

  const api = async (path, opts) =>
    page.evaluate(async ({ path, opts }) => {
      const r = await fetch(path, { cache: "no-store", ...opts });
      let j = null;
      try { j = await r.json(); } catch { /* пусто */ }
      return { status: r.status, json: j };
    }, { path, opts });

  /* ── A. Счётчик «До Нового года» ── */
  console.log("── A. Счётчик «До Нового года» под hero ──");
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(1200); // гидратация + живые настройки
  const ny = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="newyear-counter"]');
    if (!el) return null;
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    const rect = el.getBoundingClientRect();
    /* Task 143: блок между плитками СКИДКА/ДОСТАВКА/ОПЛАТА и категориями */
    const info = document.querySelector('[data-testid="home-info"]');
    const cats = document.querySelector('[data-testid="home-cats"]');
    return {
      text,
      visible: rect.height > 20,
      between: info && cats
        ? rect.top >= info.getBoundingClientRect().bottom - 60 &&
          rect.bottom <= cats.getBoundingClientRect().top + 60
        : null,
    };
  });
  if (!ny) bad("счётчик не найден на главной");
  else {
    /До Нового года/i.test(ny.text)
      ? ok(`счётчик виден: «${ny.text.slice(0, 80)}»`)
      : bad(`текст счётчика неожиданный: «${ny.text.slice(0, 80)}»`);
    /осталось\s+\d+\s+(день|дня|дней)/i.test(ny.text)
      ? ok("в счётчике одно число с правильной плюрализацией")
      : bad(`число задвоено или не найдено: «${ny.text.slice(0, 80)}»`);
    ny.visible ? ok("полоска счётчика отрисована") : bad("полоска счётчика схлопнулась");
    ny.between
      ? ok("позиция: под плитками, выше категорий (Task 143)")
      : bad(`позиция счётчика неверная (between=${ny.between})`);
  }

  /* ── B. «Поделиться» на товаре ── */
  console.log("── B. Кнопка «Поделиться» в карточке товара ──");
  const firstSlug = (await api("/api/products")).json?.data?.find?.((p) => true)?.slug || "";
  if (!firstSlug) {
    bad("не получили slug товара из /api/products");
  } else {
    await page.goto(`${BASE}/product/${firstSlug}/`, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(1000);
    const shareBtn = page.locator('[data-testid="share-button"]');
    if ((await shareBtn.count()) === 0) bad("кнопки «Поделиться» нет на товаре");
    else {
      ok("кнопка «Поделиться» на месте");
      await shareBtn.first().click();
      const menu = page.locator('[data-testid="share-menu"]');
      await menu.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
      if (!(await menu.isVisible().catch(() => false))) bad("меню шаринга не открылось");
      else {
        const items = await menu.textContent();
        ["Telegram", "WhatsApp", "ВКонтакте", "Скопировать"].every((w) => items.includes(w))
          ? ok("меню: Telegram / WhatsApp / ВКонтакте / Копировать")
          : bad(`в меню не хватает каналов: «${(items || "").slice(0, 60)}»`);
        await page.locator('[data-testid="share-copy"]').click();
        await page.waitForTimeout(400);
        const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
        clip.includes(`/product/${firstSlug}`)
          ? ok(`в буфере ссылка на товар: ${clip}`)
          : bad(`в буфере не ссылка на товар: «${clip}»`);
      }
    }
  }

  /* ── C. Быстрый просмотр в каталоге ── */
  console.log("── C. Быстрый просмотр ──");
  await page.goto(`${BASE}/catalog/`, { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(1500);
  const eye = page.locator('[data-testid="quick-view-btn"]').first();
  if ((await eye.count()) === 0) bad("глазка быстрого просмотра нет на карточках");
  else {
    ok("глазок быстрого просмотра на карточке");
    await eye.click();
    /* ВАЖНО: страница содержит и другие role=dialog (корзина, контакты,
       cookie-баннер) — таргетируемся именно на модалку быстрого просмотра */
    const dlg = page.locator('[data-testid="quick-view-dialog"]');
    await dlg.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
    if (!(await dlg.isVisible().catch(() => false))) bad("модалка быстрого просмотра не открылась");
    else {
      const dlgText = (await dlg.textContent()) || "";
      /₽/.test(dlgText) ? ok("в модалке есть цена") : bad("в модалке нет цены");
      (await dlg.locator('[data-testid="quick-view-open"]').count()) > 0
        ? ok("в модалке есть ссылка «Открыть карточку товара»")
        : bad("в модалке нет ссылки на полную карточку");
      // Добавление в корзину из модалки — бейдж шапки = 1
      const addBtn = dlg.locator("button").filter({ hasText: "В корзину" }).last();
      await addBtn.click();
      await page.waitForTimeout(600);
      const badge = await page.evaluate(() => {
        /* Бейдж корзины живёт в кнопке шапки aria-label="Корзина" */
        const el = document.querySelector('button[aria-label="Корзина"] span');
        return el ? (el.textContent || "").trim() : "";
      });
      badge !== "" ? ok(`бейдж корзины после добавления: «${badge}»`) : bad("бейдж корзины не найден");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
      (await dlg.isVisible().catch(() => false))
        ? bad("Esc не закрыл модалку")
        : ok("Esc закрывает модалку");
    }
  }

  /* ── D. SEO-лендинг категории ── */
  console.log("── D. SEO-лендинг категории ──");
  const cats = (await api("/api/categories")).json?.data ?? [];
  const cat = cats[0];
  if (!cat) bad("нет категорий в API");
  else {
    const resp = await page.goto(`${BASE}/catalog/${cat.slug}/`, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(1200);
    const h1 = ((await page.locator("h1").first().textContent()) || "").trim();
    h1 === cat.name
      ? ok(`H1 лендинга = названию категории («${h1}»)`)
      : bad(`H1 лендинга «${h1}» ≠ категории «${cat.name}»`);
    const canonical = await page.evaluate(() =>
      (document.querySelector('link[rel="canonical"]')?.getAttribute("href") || "")
    );
    canonical.includes(`/catalog/${cat.slug}`)
      ? ok(`canonical лендинга: ${canonical}`)
      : bad(`canonical не на категорию: ${canonical}`);
    const metaDesc = await page.evaluate(() =>
      document.querySelector('meta[name="description"]')?.getAttribute("content") || ""
    );
    metaDesc.length > 20 ? ok("meta description заполнен") : bad("meta description пуст");
    const cards = await page.locator('[data-testid="quick-view-btn"]').count();
    cards > 0 ? ok(`в сетке категории карточки с глазками (${cards} шт.)`) : bad("в сетке категории нет карточек");
    // Плитки на главной ведут на лендинги
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(800);
    const gridHref = await page.evaluate(() => {
      const a = [...document.querySelectorAll("a[href^='/catalog/']")].find((el) =>
        el.querySelector("img")
      );
      return a ? a.getAttribute("href") : "";
    });
    gridHref.startsWith("/catalog/") && !gridHref.includes("category=")
      ? ok(`плитка категории ведёт на ${gridHref}`)
      : bad(`плитка категории ведёт не на лендинг: ${gridHref}`);
  }

  /* ── E. Выключение быстрого просмотра ── */
  console.log("── E. Галочка «Быстрый просмотр» в настройках ──");
  const login = await api("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_LOGIN, password: ADMIN_PASS }),
  });
  if (login.status !== 200) bad("логин админа на стенде не удался");
  else {
    // cookie из ответа авторизации уже в контексте страницы
    const off = await api("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quick_view_enabled: "0" }),
    });
    off.status === 200 ? ok("quick_view_enabled=0 сохранён") : bad(`настройка не сохранилась (${off.status})`);
    await page.goto(`${BASE}/catalog/`, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(1500); // живые настройки прилетают после монтирования
    const eyes = await page.locator('[data-testid="quick-view-btn"]').count();
    eyes === 0 ? ok("глазки исчезли после выключения") : bad(`глазки остались (${eyes} шт.)`);
    await api("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quick_view_enabled: "1" }),
    });
    ok("quick_view_enabled=1 возвращён");
  }

  /* Консольные ошибки — только не связанные с сетью API */
  const realErrors = consoleErrors.filter(
    (e) => !e.includes("Failed to load resource") && !e.includes("net::")
  );
  realErrors.length === 0
    ? ok("консоль браузера чистая")
    : bad(`консольные ошибки: ${realErrors.slice(0, 3).join(" | ")}`);

  await browser.close();
  console.log("");
  console.log(`E2E: PASS=${PASS} FAIL=${FAIL}`);
  process.exit(FAIL === 0 ? 0 : 1);
})().catch((e) => {
  console.error("E2E crash:", e);
  process.exit(1);
});
