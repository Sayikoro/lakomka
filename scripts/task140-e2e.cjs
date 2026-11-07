/* Task 140 E2E: круглая кнопка с иконкой корзины на карточках товаров
 * (ProductCard — блок «Похожие подарки» в карточке товара).
 *
 * Стенд :8095 (.deploy-package, собран MODE=both). Сценарии:
 * A) На карточке товара в блоке product-similar у карточек — КРУГЛАЯ кнопка
 *    с иконкой корзины (aria-label «Добавить … в корзину»), старой текстовой
 *    кнопки «В корзину» в блоке больше нет.
 * B) Клик по круглой кнопке: НЕ уводит со страницы товара, бейдж корзины
 *    в шапке становится «1», кнопка на ~1,4 с зелёная (bg-[#2e9e5b]).
 * C) Клик по названию похожего по-прежнему открывает его карточку.
 *
 * Запуск: node scripts/task140-e2e.cjs http://127.0.0.1:8095
 */
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://127.0.0.1:8095";
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
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") {
      const url = (m.location() && m.location().url) || "";
      /* Task 151: медиа в песочнице нет (uploads вне пакета), штатный 401
         анонимной проверки auth и сторонняя аналитика из продовых настроек
         (режется по сертификату) — шум среды, не ошибки приложения */
      if (/\/uploads\//.test(url)) return;
      if (/\/api\/auth\//.test(url) && /401|Unauthorized/.test(m.text())) return;
      if (/mc\.yandex|yastatic|metrika/i.test(url)) return;
      if (/ERR_CERT_AUTHORITY_INVALID/.test(m.text())) return;
      consoleErrors.push(m.text() + " @ " + url);
    }
  });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

  /* ── A. Круглая кнопка на карточках «Похожих подарков» ── */
  console.log("── A. Похожие подарки: круглая кнопка корзины ──");
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

  const ui = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="product-similar"]');
    if (!el) return null;
    const btns = [...el.querySelectorAll('button[aria-label^="Добавить"]')];
    return {
      cards: el.children.length,
      roundButtons: btns.length,
      allRound: btns.every((b) => (b.className || "").includes("rounded-full")),
      hasCartSvg: btns.some(
        (b) => b.querySelector('svg path[d^="M2.5 3.5"]') !== null
      ),
      oldTextBtn: [...el.querySelectorAll("button")].some(
        (b) => (b.textContent || "").trim() === "В корзину"
      ),
      firstAria: btns[0]?.getAttribute("aria-label") || "",
    };
  });
  ui || bad("A: блока product-similar нет");
  ui && ui.cards === 4
    ? ok("A: 4 карточки похожих отрисованы")
    : bad(`A: карточек ${ui ? ui.cards : 0} (ожидалось 4)`);
  ui && ui.roundButtons === ui.cards
    ? ok(`A: на каждой карточке кнопка добавления (${ui.roundButtons} шт.)`)
    : bad(`A: кнопок ${ui ? ui.roundButtons : 0} из ${ui ? ui.cards : "??"} карточек`);
  ui && ui.allRound
    ? ok("A: кнопки круглые (rounded-full)")
    : bad("A: кнопка не круглая");
  ui && ui.hasCartSvg
    ? ok("A: на кнопке иконка корзины (svg)")
    : bad("A: иконки корзины на кнопке нет");
  ui && !ui.oldTextBtn
    ? ok("A: старой текстовой кнопки «В корзину» в блоке нет")
    : bad("A: в блоке осталась текстовая кнопка «В корзину»");
  ui && ui.firstAria.includes(firstSlug.slice(0, 0) + "Добавить") && ui.firstAria.includes("в корзину")
    ? ok("A: aria-label говорит «Добавить … в корзину»")
    : bad(`A: неожиданный aria-label: ${ui ? ui.firstAria : "-"}`);

  /* ── B. Клик: корзина приняла, страница не сменилась ── */
  console.log("── B. Клик по круглой кнопке ──");
  const beforeUrl = page.url();
  await page.click('[data-testid="product-similar"] button[aria-label^="Добавить"] >> nth=0');
  await page.waitForTimeout(350);

  const after = await page.evaluate(() => {
    const badge = document.querySelector('header button[aria-label="Корзина"] span');
    const btn = document.querySelector(
      '[data-testid="product-similar"] button[aria-label^="Добавить"]'
    );
    return {
      badge: badge ? (badge.textContent || "").trim() : "",
      green: btn ? (btn.className || "").includes("bg-[#2e9e5b]") : false,
    };
  });
  page.url() === beforeUrl
    ? ok("B: клик не увёл со страницы товара")
    : bad(`B: произошла навигация: ${page.url()}`);
  after.badge === "1"
    ? ok("B: бейдж корзины в шапке = 1")
    : bad(`B: бейдж корзины «${after.badge || "нет"}» (ожидалось «1»)`);
  after.green
    ? ok("B: кнопка зелёная сразу после добавления (галочка)")
    : bad("B: кнопка не позеленела после добавления");
  await page.waitForTimeout(1400);
  const still = await page.evaluate(
    () =>
      document.querySelectorAll(
        'header button[aria-label="Корзина"] span'
      ).length > 0
  );
  still
    ? ok("B: товар остался в корзине после затухания галочки")
    : bad("B: корзина опустела после затухания галочки");

  /* ── C. Название похожего по-прежнему ссылка ── */
  console.log("── C. Ссылка похожего не сломана ──");
  const href = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="product-similar"]');
    const card = el && el.children[0];
    return card?.querySelector("a")?.getAttribute("href") || "";
  });
  if (href) {
    await page.goto(BASE + href, { waitUntil: "load", timeout: 30000 });
    const navigated = await page.evaluate(
      () => !!document.querySelector("h1") && location.pathname.startsWith("/product/")
    );
    navigated
      ? ok("C: переход по названию похожего работает")
      : bad("C: переход по названию похожего не удался");
  } else {
    bad("C: у первой похожей карточки нет ссылки");
  }

  /* /api/auth/me → 401 — штатный зонд AdminToolbar на анонимной сессии
     (браузер всегда логирует 401-ответы, компонент обрабатывает их корректно). */
  const realErrors = consoleErrors.filter(
    (e) => !e.includes("/api/auth/me") || !e.includes("401")
  );
  if (realErrors.length > 0) {
    bad(`ошибки консоли: ${realErrors.slice(0, 3).join(" | ")}`);
  } else {
    ok("консоль браузера чиста (кроме штатного 401-зонда AdminToolbar)");
  }

  await browser.close();
  console.log("");
  console.log(`ИТОГО: PASS=${PASS} FAIL=${FAIL}`);
  process.exit(FAIL === 0 ? 0 : 1);
})().catch((e) => {
  console.error("E2E упал:", e);
  process.exit(1);
});
