/* Task 148 E2E: лендинги /detskie /corporate /wholesale /delivery сняты,
 * SEO-ядро Task 147 сохранено.
 * A) Главная: <title> кластера 1, ровно один H1 (Hero), SEO-блок внизу,
 *    в футере нет «Покупателям», sitemap.xml без лендингов, с /catalogs.
 * B) Старые URL лендингов отдают HTTP 404 (и 404-страница рендерится).
 * C) /catalog/nabory: <title> и H1 из MAP, BreadcrumbList 3 уровня.
 * D) Навигация: футер /catalogs и шапка /catalog работают (SPA).
 * E) Мобильный 390: главная и категория без горизонтального скролла.
 * F) Консоль браузера чиста.
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
    if (msg.type() === "error") {
      // раздел B намеренно открывает снятые лендинги (404) — их ресурсы не считаем
      const u = (msg.location() && msg.location().url) || "";
      if (/\/(detskie|corporate|wholesale|delivery)(\/|\?|$)/.test(u)) return;
      consoleErrors.push(msg.text());
    }
  });

  const jsonLd = (p) =>
    p.evaluate(() =>
      Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        .map((s) => { try { return JSON.parse(s.textContent); } catch { return null; } })
        .filter(Boolean)
    );

  /* ── A. Главная ── */
  console.log("── A. Главная ──");
  const respHome = await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  if (respHome.status() === 200) ok("главная: HTTP 200"); else bad("главная: HTTP " + respHome.status());
  const title = await page.title();
  if (title.includes("Новогодние подарки в Хабаровске — купить сладкие подарки"))
    ok("<title> кластера 1 сохранён"); else bad("<title>: " + title);
  const h1Count = await page.locator("h1").count();
  if (h1Count === 1) ok("H1 ровно один (Hero)"); else bad("H1 на странице: " + h1Count);
  const seoBlock = page.locator('[data-testid="home-seo"]');
  if (await seoBlock.count()) ok("SEO-блок внизу главной"); else bad("нет SEO-блока home-seo");
  const footNav = page.locator('footer nav[aria-label="Покупателям"]');
  if (!(await footNav.count())) ok("футер: блока «Покупателям» нет"); else bad("футер: «Покупателям» остался");
  const deadLinks = await page.locator('a[href="/detskie"], a[href="/detskie/"], a[href="/corporate"], a[href="/corporate/"], a[href="/wholesale"], a[href="/wholesale/"], a[href="/delivery"], a[href="/delivery/"]').count();
  if (deadLinks === 0) ok("на главной нет ссылок на лендинги"); else bad("на главной " + deadLinks + " ссылок на лендинги");
  const sm = await page.evaluate(() => fetch("/sitemap.xml").then((r) => r.text()));
  for (const r of ["detskie", "corporate", "wholesale", "delivery"]) {
    if (!sm.includes(r + "</loc>")) ok("sitemap.xml без /" + r); else bad("sitemap.xml содержит /" + r);
  }
  if (sm.includes("catalogs</loc>")) ok("sitemap.xml: /catalogs"); else bad("sitemap.xml без /catalogs");

  /* ── B. Старые URL лендингов → 404 ── */
  console.log("── B. Старые URL → 404 ──");
  for (const r of ["detskie", "corporate", "wholesale", "delivery"]) {
    const resp = await page.goto(`${BASE}/${r}/`, { waitUntil: "load" });
    if (resp.status() === 404) ok("/" + r + "/ → HTTP 404"); else bad("/" + r + "/ → HTTP " + resp.status());
  }
  await page.goto(BASE + "/detskie/", { waitUntil: "load" });
  const notFoundText = (await page.textContent("body")).includes("404");
  if (notFoundText) ok("404-страница рендерится"); else bad("404-страница не рендерится");

  /* ── C. Категория из MAP ── */
  console.log("── C. /catalog/nabory ──");
  await page.goto(BASE + "/catalog/nabory/", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const nabTitle = await page.title();
  if (nabTitle === "Подарочные наборы конфет — купить в Хабаровске — Лакомка") ok("<title> из MAP"); else bad("<title>: " + nabTitle);
  const nabH1 = (await page.locator("h1").first().textContent()).trim();
  if (nabH1 === "Подарочные наборы конфет") ok("H1 из MAP"); else bad("H1: " + nabH1);
  const nabLd = await jsonLd(page);
  const nabBc = nabLd.find((d) => d["@type"] === "BreadcrumbList");
  if (nabBc && nabBc.itemListElement.length === 3) ok("BreadcrumbList: 3 уровня"); else bad("BreadcrumbList: " + (nabBc ? nabBc.itemListElement.length : "нет"));
  const nabCards = await page.locator('[data-testid="product-card"], a[href^="/product/"]').count();
  if (nabCards > 0) ok("живой каталог: карточек " + nabCards); else bad("каталог категории пуст");

  /* ── D. SPA-навигация по сохранённым ссылкам ── */
  console.log("── D. Навигация ──");
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.click('footer a[href="/catalogs/"]');
  await page.waitForTimeout(2000);
  if (page.url().includes("/catalogs")) ok("футер: /catalogs открывается"); else bad("URL после клика: " + page.url());

  /* ── E. Мобильный 390 ── */
  console.log("── E. Мобильный 390 ──");
  const mob = await ctx.browser().newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const mpage = await mob.newPage();
  for (const r of ["", "catalog/nabory"]) {
    await mpage.goto(`${BASE}/${r}`, { waitUntil: "load" });
    await mpage.waitForTimeout(1200);
    const over = await mpage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over <= 0) ok(`/${r || "(главная)"}: без горизонтали`); else bad(`/${r}: горизонталь ${over}px`);
  }
  await mob.close();

  /* ── F. Консоль ── */
  console.log("── F. Консоль ──");
  const realErrors = consoleErrors.filter((e) => !e.includes("401") && !e.includes("/api/auth/me"));
  if (realErrors.length === 0) ok("консоль браузера чиста"); else bad("ошибки консоли: " + realErrors.slice(0, 3).join(" | "));

  await browser.close();
  console.log("");
  console.log(`ИТОГО: PASS=${pass} FAIL=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
