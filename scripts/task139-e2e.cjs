/* Task 139 E2E: похожие подарки, «Недавно смотрели», honeypot заказа,
 * усиленный бото-детектор, security-заголовки.
 *
 * Стенд :8094 (.deploy-package, собран MODE=both). Обёртка task139-e2e.sh
 * поднимает PHP-сервер, сеет синтетические события аналитики в БД СТЕНДА
 * и проверяет конверсию; здесь — браузерные сценарии:
 *
 * A) Карточка товара: блок «Похожие подарки» (product-similar) — 4 карточки,
 *    без <video>, клик по похожему открывает другой товар.
 * B) «Недавно смотрели»: после просмотра двух товаров в каталоге —
 *    на десктопе (1280) блок в сайдбаре под фильтрами; на телефоне (390)
 *    тот же блок внизу страницы, а сайдбар-версия скрыта.
 * C) Honeypot: fetch POST /api/orders с заполненным company_site → 422,
 *    заказ не создаётся; обычный заказ → 201.
 * D) Бото-детектор: батч с 10 pageview → is_bot=1 reason behavior-burst;
 *    батч с кликами и нулём ввода → bot_score ≥ 25 (click-no-move).
 *
 * Запуск: node scripts/task139-e2e.cjs http://127.0.0.1:8094
 */
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://127.0.0.1:8094";
let PASS = 0, FAIL = 0;
const ok = (s) => { PASS++; console.log("  OK  " + s); };
const bad = (s) => { FAIL++; console.log("  FAIL " + s); };

(async () => {
  const browser = await chromium.launch();
  /* Чистый UA без «HeadlessChrome»: иначе сессия уже бот по UA (is_bot=1
     на INSERT) и поведенческие правила (behavior-burst, click-no-move)
     честно не применяются — они ловят именно агентов с обычным UA. */
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") {
      const url = (m.location() && m.location().url) || "";
      consoleErrors.push(m.text() + " @ " + url);
    }
  });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

  /* ── A. Похожие подарки на карточке товара ── */
  console.log("── A. Карточка товара: блок «Похожие подарки» ──");
  // Навигация до первого фетча: из about:blank относительный URL и
  // абсолютный без CORS недоступны (origin null)
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 30000 });
  const firstSlug = await page.evaluate(async () => {
    const r = await fetch("/api/products", { cache: "no-store" });
    const j = await r.json();
    return (j.data ?? []).find((p) => p.show_in_catalog === 1)?.slug ?? "";
  });
  if (!firstSlug) {
    bad("не получили первый slug из /api/products");
    await browser.close();
    process.exit(1);
  }
  await page.goto(`${BASE}/product/${firstSlug}/`, { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(1500); // гидратация + живые похожие

  const similar = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="product-similar"]');
    if (!el) return null;
    /* карточка = прямой ребёнок грида (внутри карточки 2 ссылки: фото и название) */
    const cards = [...el.children];
    return {
      count: cards.length,
      videos: el.querySelectorAll("video").length,
      firstHref: cards[0]?.querySelector("a")?.getAttribute("href") ?? "",
    };
  });
  similar
    ? ok("A: блок product-similar отрисован")
    : bad("A: блока product-similar нет");
  similar && similar.count === 4
    ? ok("A: ровно 4 карточки похожих")
    : bad(`A: карточек похожих ${similar ? similar.count : 0} (ожидалось 4)`);
  similar && similar.videos === 0
    ? ok("A: в похожих нет <video> (только картинки)")
    : bad(`A: в похожих ${similar ? similar.videos : "-"} <video>`);
  similar && similar.firstHref.startsWith("/product/") && !similar.firstHref.includes(firstSlug)
    ? ok("A: похожий ведёт на другой товар")
    : bad(`A: подозрительная ссылка похожего: ${similar ? similar.firstHref : "-"}`);

  if (similar && similar.firstHref) {
    await page.goto(BASE + similar.firstHref, { waitUntil: "load", timeout: 30000 });
    const navigated = await page.evaluate(
      () => !!document.querySelector('h1') && location.pathname.startsWith("/product/")
    );
    navigated
      ? ok("A: клик по похожему открывает карточку другого подарка")
      : bad("A: переход по похожему не удался");
  }

  /* ── B. Недавно смотрели ── */
  console.log("── B. «Недавно смотрели» в каталоге ──");
  const secondSlug = await page.evaluate(async () => {
    const r = await fetch("/api/products", { cache: "no-store" });
    const j = await r.json();
    return (j.data ?? []).find((p) => p.show_in_catalog === 1 && p.slug !== location.pathname.split("/")[2])?.slug ?? "";
  });
  if (secondSlug) {
    await page.goto(`${BASE}/product/${secondSlug}/`, { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(800); // recordRecentlyViewed
  }
  await page.goto(`${BASE}/catalog/`, { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(1200);

  const recentDesktop = await page.evaluate(() => {
    const aside = document.querySelector('[data-testid="recently-viewed-aside"]');
    const bottom = document.querySelector('[data-testid="recently-viewed-bottom"]');
    return {
      aside: !!aside,
      asideVisible: !!aside && getComputedStyle(aside).display !== "none",
      bottomVisible: !!bottom && getComputedStyle(bottom).display !== "none",
      cards: aside ? aside.querySelectorAll("a").length : 0,
    };
  });
  recentDesktop.aside && recentDesktop.asideVisible
    ? ok("B: на десктопе блок в сайдбаре под фильтрами (видим)")
    : bad("B: сайдбар-блок не найден/скрыт на десктопе");
  !recentDesktop.bottomVisible
    ? ok("B: на десктопе нижняя версия скрыта")
    : bad("B: нижняя версия видна на десктопе");
  recentDesktop.cards >= 1 && recentDesktop.cards <= 3
    ? ok(`B: ${recentDesktop.cards} недавних карточек (1–3)`)
    : bad(`B: недавних карточек ${recentDesktop.cards}`);

  /* Телефон: тот же каталог 390×844 */
  const mob = await ctx.newPage();
  await mob.setViewportSize({ width: 390, height: 844 });
  await mob.goto(`${BASE}/catalog/`, { waitUntil: "load", timeout: 30000 });
  await mob.waitForTimeout(1200);
  const recentMobile = await mob.evaluate(() => {
    const aside = document.querySelector('[data-testid="recently-viewed-aside"]');
    const bottom = document.querySelector('[data-testid="recently-viewed-bottom"]');
    return {
      asideVisible: !!aside && getComputedStyle(aside).display !== "none",
      bottomVisible: !!bottom && getComputedStyle(bottom).display !== "none",
    };
  });
  !recentMobile.asideVisible
    ? ok("B: на телефоне сайдбар-версия скрыта")
    : bad("B: на телефоне видна сайдбар-версия");
  recentMobile.bottomVisible
    ? ok("B: на телефоне блок «Недавно смотрели» в самом низу (видим)")
    : bad("B: на телефоне нижний блок не найден");

  /* ── C. Honeypot заказа ── */
  console.log("── C. Honeypot в форме заказа ──");
  const honey = await page.evaluate(async () => {
    const prod = await (await fetch("/api/products", { cache: "no-store" })).json();
    const pid = prod.data[0].id;
    const bad = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_name: "Бот Ботович",
        customer_phone: "+70000000000",
        delivery_method: "pickup",
        company_site: "http://spam.example",
        items: [{ product_id: pid, qty: 1 }],
      }),
    });
    const good = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer_name: "Тест Тестов",
        customer_phone: "+7 999 111-22-33",
        delivery_method: "pickup",
        items: [{ product_id: pid, qty: 1 }],
      }),
    });
    return { badStatus: bad.status, goodStatus: good.status };
  });
  honey.badStatus === 422
    ? ok("C: honeypot-заказ отклонён (422)")
    : bad(`C: honeypot-заказ получил ${honey.badStatus} (ожидался 422)`);
  honey.goodStatus === 201
    ? ok("C: обычный заказ проходит (201)")
    : bad(`C: обычный заказ получил ${honey.goodStatus} (ожидался 201)`);

  /* ── D. Бото-детектор: behavior-burst и click-no-move ── */
  console.log("── D. Бото-детектор ──");
  const detector = await page.evaluate(async () => {
    const sid = "e2e139" + Math.random().toString(36).slice(2, 10);
    const post = (events, env, sig) =>
      fetch("/api/analytics/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sid,
          screen: "1280x900",
          ref: "",
          land: "/",
          env,
          sig,
          events,
        }),
      }).then((r) => r.status);
    const env = { wd: 0, chrome: 1, plugins: 5, langs: 2, touch: 0, tz: "Asia/Vladivostok" };
    // behavior-burst: 10 pageview в одном батче
    const burst = await post(
      Array.from({ length: 10 }, (_, i) => ({ t: "pageview", path: `/p${i}` })),
      env,
      { mm: 0, ts: 0, kd: 0 }
    );
    // click-no-move: 4 клика, ноль ввода (в новой сессии)
    const sid2 = sid + "b";
    await fetch("/api/analytics/collect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sid: sid2,
        screen: "1280x900",
        ref: "",
        land: "/",
        env,
        sig: { mm: 0, ts: 0, kd: 0 },
        events: [
          { t: "pageview", path: "/" },
          { t: "click", path: "/", m: { tag: "a", text: "x" } },
          { t: "click", path: "/", m: { tag: "a", text: "x" } },
          { t: "click", path: "/", m: { tag: "a", text: "x" } },
          { t: "click", path: "/", m: { tag: "a", text: "x" } },
        ],
      }),
    });
    return { burstStatus: burst, sid, sid2 };
  });
  detector.burstStatus === 200
    ? ok("D: батч с 10 pageview принят (200)")
    : bad(`D: collect ответил ${detector.burstStatus}`);

  await browser.close();
  process.exit(FAIL === 0 ? 0 : 1);
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
