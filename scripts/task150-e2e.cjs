/* Task 150 E2E: нет вспышки 404 между прелоадером и карточкой «спасённого»
 * товара (товар есть в API, но его статической страницы в пакете нет).
 * A) Жёсткое открытие нового товара /product/<slug>/: HTTP 404 (так живёт
 *    статика), заставка держится (hold), карточка товара рендерится, и
 *    заголовок «404» ни разу не становится видимым на экране.
 * B) Несуществующий товар: заставка гасится, 404 честно показывается
 *    (проверка, что детектор вспышки живой, а удержание не вечное).
 * C) Запечённый товар: обычная загрузка, заставка гасится штатно.
 * D) Клиентская навигация из каталога на новый товар: без вспышки 404.
 * E) Непродуктовая 404 (/detskie/): заставка не задерживается.
 * F) Консоль браузера чиста.
 */
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://127.0.0.1:8099";
const NEW_SLUG = process.argv[3] || "test-posle-sborki";
const NEW_NAME = process.argv[4] || "Тестовый подарок после сборки";

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log("  OK  " + m); };
const bad = (m) => { fail++; console.log("  FAIL " + m); };

/* Детектор вспышки 404: следим за всеми h1; если «404» становится видимым
 * (offsetHeight>0) в момент, когда бут-сплэш уже не накрывает экран
 * (data-boot="done"), — фиксируем window.__nf404Seen. Реинициализируется
 * на каждом жёстком переходе (новый документ). */
const FLASH_WATCH = `
(function(){
  window.__nf404Seen = false;
  function check(){
    try{
      if (document.documentElement.getAttribute("data-boot") !== "done") return;
      var hs = document.querySelectorAll("h1");
      for (var i=0;i<hs.length;i++){
        if ((hs[i].textContent||"").trim() === "404" && hs[i].offsetHeight > 0){
          window.__nf404Seen = true; return;
        }
      }
    }catch(e){}
  }
  var mo = new MutationObserver(check);
  function arm(){ try{ mo.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["data-boot"]}); }catch(e){} }
  if (document.documentElement) arm(); else document.addEventListener("readystatechange",arm);
  document.addEventListener("DOMContentLoaded", check);
  window.addEventListener("load", check);
})();
`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  await ctx.addInitScript(FLASH_WATCH);
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const u = (msg.location() && msg.location().url) || "";
      // намеренные 404-ресурсы: страницы снятых лендингов (E), товара без
      // статики (A) и его спасение несуществующего (B) + штатный 401-зонд
      const intentional404 = /test-posle-sborki|net-takogo|\/(detskie|corporate|wholesale|delivery)(\/|\?|$)/.test(u);
      if (intentional404 && msg.text().includes("404")) return;
      // медиа в песочнице нет (uploads не входит в пакет; прод-синк Task 152
      // ссылается на файлы медиа прода) — 404 картинок шумом не считаем
      if (/\/uploads\//.test(u)) return;
      if (msg.text().includes("401") || msg.text().includes("/api/auth/me")) return;
      consoleErrors.push(msg.text() + " @ " + u);
    }
  });

  const bootDone = (p, timeout = 6000) =>
    p.waitForFunction(
      () => document.documentElement.getAttribute("data-boot") === "done",
      { timeout },
    );

  /* ── A. Новый товар (есть в API, страницы в пакете нет) ── */
  console.log("── A. Новый товар: жёсткое открытие ──");
  const respA = await page.goto(`${BASE}/product/${NEW_SLUG}/`, { waitUntil: "domcontentloaded" });
  if (respA.status() === 404) ok("новый товар: HTTP 404 (статика отсутствует — как в проде)"); else bad("новый товар: HTTP " + respA.status());
  try {
    await page.waitForFunction(
      () => window.__bootRelease !== undefined || window.__bootEarlyRelease === true,
      { timeout: 5000 },
    );
    ok("заставка удержана до завершения спасения (hold вооружён)");
  } catch { bad("удержание заставки не вооружилось (__bootRelease/__bootEarlyRelease)"); }
  try {
    await page.waitForSelector(`h1:has-text("${NEW_NAME}")`, { timeout: 8000 });
    ok(`карточка спасённого товара отрисовалась (h1 «${NEW_NAME}»)`);
  } catch { bad("карточка спасённого товара не отрисовалась"); }
  try { await bootDone(page); ok("заставка погашена после отрисовки карточки"); }
  catch { bad("заставка не погашена после отрисовки карточки"); }
  const seenA = await page.evaluate(() => window.__nf404Seen);
  if (!seenA) ok("вспышки 404 не было (детектор молчит)"); else bad("ДЕТЕКТОР: заголовок 404 был видим на экране");
  const titleA = await page.title();
  if (titleA.includes(NEW_NAME)) ok("document.title заменён на товар"); else bad("title после спасения: " + titleA);

  /* ── B. Несуществующий товар: 404 честно показывается ── */
  console.log("── B. Несуществующий товар ──");
  await page.goto(`${BASE}/product/net-takogo-podarka-9999/`, { waitUntil: "domcontentloaded" });
  try {
    await page.waitForSelector('h1:text-is("404")', { timeout: 8000 });
    ok("404-страница показана (удержание не вечное)");
  } catch { bad("404-страница для несуществующего товара не показана"); }
  try { await bootDone(page); } catch { bad("заставка не погашена на настоящей 404"); }
  const seenB = await page.evaluate(() => window.__nf404Seen);
  if (seenB) ok("детектор вспышки живой (404 зафиксирован, как и задумано)"); else bad("детектор вспышки не сработал на настоящей 404");

  /* ── C. Запечённый товар: обычная загрузка ── */
  console.log("── C. Запечённый товар ──");
  const BAKED = process.argv[5] || "";
  if (BAKED) {
    await page.goto(`${BASE}/product/${BAKED}/`, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForSelector("main h1", { timeout: 8000 });
      const h1c = ((await page.locator("main h1").first().textContent()) || "").trim();
      if (h1c && h1c !== "404") ok(`запечённый товар открывается (h1 «${h1c.slice(0, 40)}…»)`);
      else bad("запечённый товар: неожиданный h1: " + h1c);
    } catch { bad("запечённый товар: h1 не найден"); }
    try { await bootDone(page); ok("запечённый товар: заставка гасится штатно"); }
    catch { bad("запечённый товар: заставка зависла"); }
  } else {
    bad("нет запечённого товара для проверки (argv[5])");
  }

  /* ── D. Клиентская навигация из каталога на новый товар ── */
  console.log("── D. SPA-навигация на новый товар ──");
  await page.goto(`${BASE}/catalog/`, { waitUntil: "load" });
  let link = null;
  try {
    link = await page.waitForSelector(`a[href="/product/${NEW_SLUG}/"]`, { timeout: 10000 });
    ok("новый товар появился в живом каталоге");
  } catch { bad("нового товара нет в живом каталоге"); }
  if (link) {
    await link.click();
    try {
      await page.waitForSelector(`h1:has-text("${NEW_NAME}")`, { timeout: 8000 });
      ok("клик из каталога открыл карточку нового товара");
    } catch { bad("после клика карточка нового товара не открылась"); }
    const seenD = await page.evaluate(() => window.__nf404Seen);
    if (!seenD) ok("SPA-переход: без вспышки 404"); else bad("SPA-переход: заголовок 404 был видим");
    if (page.url().includes(`/product/${NEW_SLUG}`)) ok("URL сменился на новый товар"); else bad("URL после SPA-клика: " + page.url());
  }

  /* ── E. Непродуктовая 404: заставка не задерживается ── */
  console.log("── E. Непродуктовая 404 ──");
  const respE = await page.goto(`${BASE}/detskie/`, { waitUntil: "domcontentloaded" });
  if (respE.status() === 404) ok("/detskie/: HTTP 404 (Task 148)"); else bad("/detskie/: HTTP " + respE.status());
  try {
    await page.waitForSelector('h1:text-is("404")', { timeout: 6000 });
    ok("непродуктовая 404 показана без долгого удержания");
  } catch { bad("непродуктовая 404 не показана (заставка зависла?)"); }
  try { await bootDone(page); } catch { bad("заставка не погашена на непродуктовой 404"); }

  /* ── F. Консоль ── */
  console.log("── F. Консоль ──");
  if (consoleErrors.length === 0) ok("консоль браузера чиста"); else bad("ошибки консоли: " + consoleErrors.slice(0, 3).join(" | "));

  await browser.close();
  console.log("");
  console.log(`ИТОГО: PASS=${pass} FAIL=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("CRASH:", e.message); process.exit(1); });
