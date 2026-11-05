/* Task 147 E2E: SEO-лендинги семантического ядра.
 * A) Главная: <title> кластера 1, H1 в Hero, SEO-блок внизу,
 *    футер-ссылки «Покупателям» (4 шт.), sitemap.xml с новыми URL.
 * B) /corporate: H1, FAQ-разметка (визуал + JSON-LD совпадают),
 *    скидки, CTA-панель с телефонами.
 * C) /wholesale: H1, шаги закупки, FAQ, ссылка в каталог.
 * D) /delivery: H1, 4 способа доставки, оплата 20%, способы.
 * E) /detskie: H1, каталог отрисован (карточки), FAQ.
 * F) /catalog/nabory: <title> из MAP, H1 «Подарочные наборы конфет».
 * G) Клик по футер-ссылке ведёт на страницу (SPA-навигация).
 * H) Мобильный 390: все новые страницы без горизонтального скролла.
 * I) Консоль браузера чиста.
 */
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://127.0.0.1:8098";

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log("  OK  " + m); };
const bad = (m) => { fail++; console.log("  FAIL " + m); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  const jsonLd = (page) =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        .map((s) => { try { return JSON.parse(s.textContent); } catch { return null; } })
        .filter(Boolean)
    );

  /* ── A. Главная ── */
  console.log("── A. Главная ──");
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  const title = await page.title();
  if (title.includes("Новогодние подарки в Хабаровске — купить сладкие подарки"))
    ok("<title> кластера 1"); else bad("<title>: " + title);
  const h1 = await page.locator("h1").first().textContent();
  if (h1 && h1.trim().length > 0) ok("H1 на главной (Hero): «" + h1.trim() + "»"); else bad("H1 на главной пуст");
  const h1Count = await page.locator("h1").count();
  if (h1Count === 1) ok("H1 ровно один"); else bad("H1 на странице: " + h1Count);
  const seoBlock = page.locator('[data-testid="home-seo"]');
  if (await seoBlock.count()) {
    ok("SEO-блок внизу главной");
    const seoText = await seoBlock.textContent();
    if (seoText.includes("Красный Октябрь") && seoText.includes("оптом")) ok("SEO-текст: фабрики + опт"); else bad("SEO-текст без фабрик/опта");
  } else bad("нет SEO-блока home-seo");
  for (const [path, name] of [["/detskie/", "Детские подарки"], ["/corporate/", "Корпоративным клиентам"], ["/wholesale/", "Оптовые закупки"], ["/delivery/", "Доставка и оплата"]]) {
    const link = page.locator(`footer nav[aria-label="Покупателям"] a[href="${path}"]`);
    if (await link.count()) ok(`футер: ${name} → ${path}`); else bad(`футер: нет ссылки ${path}`);
  }
  const sm = await page.evaluate(() => fetch("/sitemap.xml").then((r) => r.text()));
  for (const r of ["detskie", "corporate", "wholesale", "delivery", "catalog/nabory"]) {
    if (sm.includes(r + "</loc>")) ok("sitemap.xml: " + r); else bad("sitemap.xml без " + r);
  }

  /* ── B. /corporate ── */
  console.log("── B. /corporate ──");
  await page.goto(BASE + "/corporate/", { waitUntil: "load" });
  const corTitle = await page.title();
  if (corTitle.includes("Корпоративные новогодние подарки в Хабаровске")) ok("<title>"); else bad("<title>: " + corTitle);
  const corH1 = (await page.locator("h1").first().textContent()).trim();
  if (corH1 === "Корпоративные новогодние подарки в Хабаровске") ok("H1"); else bad("H1: " + corH1);
  const corLd = await jsonLd(page);
  const faq = corLd.find((d) => d["@type"] === "FAQPage");
  if (faq && faq.mainEntity.length === 4) ok("FAQPage: 4 вопроса в JSON-LD"); else bad("FAQPage: " + (faq ? faq.mainEntity.length : "нет"));
  const bc = corLd.find((d) => d["@type"] === "BreadcrumbList");
  if (bc && bc.itemListElement.length === 2) ok("BreadcrumbList: 2 уровня"); else bad("BreadcrumbList: " + (bc ? bc.itemListElement.length : "нет"));
  const details = await page.locator("details").count();
  if (details === 4) ok("визуальный FAQ: 4 details"); else bad("details: " + details);
  const body = await page.textContent("body");
  if (body.includes("5%") && body.includes("10%")) ok("скидки 5–10% на странице"); else bad("скидок нет");
  if (body.includes("78 96 21")) ok("CTA: телефон на месте"); else bad("CTA: нет телефона");
  const utp = await page.locator("h2").allTextContents();
  if (utp.some((t) => t.includes("Как заказать корпоративные подарки"))) ok("блок «Как заказать»"); else bad("нет блока «Как заказать»");

  /* ── C. /wholesale ── */
  console.log("── C. /wholesale ──");
  await page.goto(BASE + "/wholesale/", { waitUntil: "load" });
  const whTitle = await page.title();
  if (whTitle.includes("Новогодние подарки оптом в Хабаровске")) ok("<title>"); else bad("<title>: " + whTitle);
  const whH1 = (await page.locator("h1").first().textContent()).trim();
  if (whH1 === "Новогодние подарки оптом в Хабаровске") ok("H1"); else bad("H1: " + whH1);
  const whBody = await page.textContent("body");
  if (whBody.includes("родительских комитетов") && whBody.includes("школ")) ok("аудитория школ/садов/комитетов"); else bad("нет школ/садов/комитетов");
  if (whBody.includes("до отправки")) ok("корректировка заказа до отправки"); else bad("нет корректировки");
  if (whBody.includes("20%")) ok("предоплата 20%"); else bad("нет предоплаты");
  const whLd = await jsonLd(page);
  const whFaq = whLd.find((d) => d["@type"] === "FAQPage");
  if (whFaq && whFaq.mainEntity.length === 5) ok("FAQPage: 5 вопросов"); else bad("FAQPage wholesale: " + (whFaq ? whFaq.mainEntity.length : "нет"));
  const catLink = page.locator('a[href="/catalog/"]');
  if (await catLink.count()) ok("перелинковка: ссылка в каталог"); else bad("нет ссылки в каталог");

  /* ── D. /delivery ── */
  console.log("── D. /delivery ──");
  await page.goto(BASE + "/delivery/", { waitUntil: "load" });
  const dTitle = await page.title();
  if (dTitle.includes("Доставка и оплата")) ok("<title>"); else bad("<title>: " + dTitle);
  const dH1 = (await page.locator("h1").first().textContent()).trim();
  if (dH1 === "Доставка и оплата") ok("H1"); else bad("H1: " + dH1);
  const dBody = await page.textContent("body");
  for (const fact of ["5 000 ₽", "20%", "Наличные", "Безналичный расчёт", "СБП", "Самовывоз", "транспортной компанией"]) {
    if (dBody.toLowerCase().includes(fact.toLowerCase())) ok("факт: " + fact); else bad("нет факта: " + fact);
  }
  if (dBody.includes("680031") || dBody.includes("Карла Маркса")) ok("адрес самовывоза"); else bad("нет адреса");
  const dLd = await jsonLd(page);
  const dFaq = dLd.find((d) => d["@type"] === "FAQPage");
  if (dFaq && dFaq.mainEntity.length === 5) ok("FAQPage: 5 вопросов"); else bad("FAQPage delivery: " + (dFaq ? dFaq.mainEntity.length : "нет"));

  /* ── E. /detskie ── */
  console.log("── E. /detskie ──");
  await page.goto(BASE + "/detskie/", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const kidTitle = await page.title();
  if (kidTitle.includes("Детские новогодние подарки в Хабаровске")) ok("<title>"); else bad("<title>: " + kidTitle);
  const kidH1 = (await page.locator("h1").first().textContent()).trim();
  if (kidH1 === "Детские новогодние подарки в Хабаровске") ok("H1"); else bad("H1: " + kidH1);
  const cards = await page.locator('[data-testid="product-card"], a[href^="/product/"]').count();
  if (cards > 0) ok("каталог отрисован: карточек " + cards); else bad("каталог пуст");
  const kidLd = await jsonLd(page);
  if (kidLd.find((d) => d["@type"] === "FAQPage")) ok("FAQPage в JSON-LD"); else bad("нет FAQPage");

  /* ── F. /catalog/nabory (MAP категорий) ── */
  console.log("── F. /catalog/nabory ──");
  await page.goto(BASE + "/catalog/nabory/", { waitUntil: "load" });
  const nabTitle = await page.title();
  if (nabTitle === "Подарочные наборы конфет — купить в Хабаровске — Лакомка") ok("<title> из MAP"); else bad("<title>: " + nabTitle);
  const nabH1 = (await page.locator("h1").first().textContent()).trim();
  if (nabH1 === "Подарочные наборы конфет") ok("H1 из MAP"); else bad("H1: " + nabH1);
  const nabLd = await jsonLd(page);
  const nabBc = nabLd.find((d) => d["@type"] === "BreadcrumbList");
  if (nabBc && nabBc.itemListElement.length === 3) ok("BreadcrumbList: 3 уровня"); else bad("BreadcrumbList: " + (nabBc ? nabBc.itemListElement.length : "нет"));

  /* ── G. SPA-переход по футер-ссылке ── */
  console.log("── G. Навигация по футер-ссылке ──");
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.click('footer nav[aria-label="Покупателям"] a[href="/delivery/"]');
  await page.waitForTimeout(2500);
  if (page.url().includes("/delivery")) ok("клик по футер-ссылке ведёт на /delivery"); else bad("URL после клика: " + page.url());
  const dH1b = (await page.locator("h1").first().textContent()).trim();
  if (dH1b === "Доставка и оплата") ok("страница отрисовалась после SPA-перехода"); else bad("после перехода H1: " + dH1b);

  /* ── H. Мобильный 390 ── */
  console.log("── H. Мобильный 390 ──");
  const mob = await ctx.browser().newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const mpage = await mob.newPage();
  for (const r of ["", "corporate", "wholesale", "delivery", "detskie"]) {
    await mpage.goto(`${BASE}/${r ? r + "/" : ""}`, { waitUntil: "load" });
    await mpage.waitForTimeout(1200);
    const over = await mpage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over <= 0) ok(`/ ${r || "(главная)"}: без горизонтали`); else bad(`/${r}: горизонталь ${over}px`);
  }
  await mob.close();

  /* ── I. Консоль ── */
  console.log("── I. Консоль ──");
  const realErrors = consoleErrors.filter((e) => !e.includes("401") && !e.includes("/api/auth/me"));
  if (realErrors.length === 0) ok("консоль браузера чиста"); else bad("ошибки консоли: " + realErrors.slice(0, 3).join(" | "));

  await browser.close();
  console.log("");
  console.log(`ИТОГО: PASS=${pass} FAIL=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
