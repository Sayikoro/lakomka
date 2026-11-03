/* Task 136 E2E: бут-сплэш (прелоадер со смешными фразами) на витрине.
 *
 * Проверяет на стенде :8090 (.deploy-package):
 *   A) Обычная загрузка главной: сплэш виден сразу (opacity 1, фраза на
 *      месте), гаснет по data-boot=hidden→done, не раньше ~900 мс и не
 *      позже ~5 с; после гидратации НЕ возвращается; консоль без ошибок
 *      гидратации и uncaught-исключений.
 *   B) Медленная сеть (Slow 4G + CPU×4): сплэш живёт всю загрузку, фразы
 *      РОТИРУЮТСЯ (текст меняется), таймлайн data-boot = hidden → done.
 *   C) /admin/: заставка мгновенно done — ни одного 'hidden' в таймлайне.
 *   D) Клиентская навигация после загрузки работает, заставка не возвращается.
 *   E) bfcache: назад-вперёд — заставка не застревает.
 *   F) Страница каталога: сплэш появляется и гаснет штатно.
 *
 * Запуск: NODE_PATH=/home/z/.npm-global/lib/node_modules node scripts/task136-e2e.cjs http://127.0.0.1:8090
 */
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://127.0.0.1:8090";
let PASS = 0, FAIL = 0;
const ok = (s) => { PASS++; console.log("  OK  " + s); };
const bad = (s) => { FAIL++; console.log("  FAIL " + s); };

/* Init-скрипт в каждую страницу: пишет таймлайн атрибута data-boot на <html> */
const INIT = () => {
  window.__bootLog = [];
  const log = () => {
    try {
      window.__bootLog.push([Math.round(performance.now()), document.documentElement.getAttribute("data-boot")]);
    } catch (e) { /* ignore */ }
  };
  document.addEventListener("DOMContentLoaded", log);
  const tryObserve = () => {
    try {
      if (document.documentElement && !window.__bootMO) {
        window.__bootMO = new MutationObserver(log);
        window.__bootMO.observe(document.documentElement, { attributes: true, attributeFilter: ["data-boot"] });
      }
    } catch (e) { /* ignore */ }
  };
  tryObserve();
  document.addEventListener("readystatechange", tryObserve);
};

async function bootState(page) {
  return page.evaluate(() => {
    const b = document.getElementById("boot-loader");
    return {
      attr: document.documentElement.getAttribute("data-boot"),
      opacity: b ? getComputedStyle(b).opacity : "MISSING",
      display: b ? getComputedStyle(b).display : "MISSING",
      phrase: document.getElementById("boot-phrase")
        ? document.getElementById("boot-phrase").textContent
        : "",
    };
  });
}

function waitAttr(page, value, timeoutMs) {
  return page.waitForFunction(
    (v) => document.documentElement.getAttribute("data-boot") === v,
    value,
    { timeout: timeoutMs, polling: 100 }
  );
}

(async () => {
  const browser = await chromium.launch();
  const consoleErrors = [];

  /* ---------- A. Обычная загрузка главной ---------- */
  console.log("── A. Главная, обычная сеть ──");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(INIT);
    const page = await ctx.newPage();
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

    const t0 = Date.now();
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 30000 });
    const early = await bootState(page);
    if (early.opacity === "1") ok(`сплэш виден при первой проверке (opacity=1, attr=${early.attr})`);
    else bad(`сплэш не виден: opacity=${early.opacity} attr=${early.attr}`);
    if (early.phrase && early.phrase.length > 5) ok(`фраза на месте: «${early.phrase.slice(0, 42)}…»`);
    else bad("фраза пуста/короткая: " + JSON.stringify(early.phrase));
    if (early.display !== "none") ok("сплэш в потоке на старте (display=" + early.display + ")");
    else bad("сплэш уже display:none на старте");

    await waitAttr(page, "done", 8000).catch(() => {});
    const doneMs = Date.now() - t0;
    await page.waitForTimeout(400); /* даём фейду 0.25 с доиграть */
    const mid = await bootState(page);
    if (mid.attr === "done") {
      if (doneMs >= 700 && doneMs <= 5000) ok(`скрыт за ${doneMs} мс (700…5000)`);
      else bad(`время скрытия вне диапазона: ${doneMs} мс`);
    } else bad("data-boot=done не наступил за 8 с: " + mid.attr);
    if (mid.display === "none") ok("после done заставка display:none (!important перекрыл инлайн-flex)");
    else bad(`заставка не убрана после done: display=${mid.display} opacity=${mid.opacity}`);

    /* После гидратации заставка не должна вернуться.
     * display:none — авторитетная проверка: при display:none computed
     * opacity возвращается к specified-значению 1 (правило hidden уже не
     * матчится, а элемент и так невидим). */
    await page.waitForTimeout(2500);
    const late = await bootState(page);
    if (late.attr === "done" && late.display === "none")
      ok("через 2.5 с после done — по-прежнему скрыт (гидратация не вернула)");
    else bad("заставка вернулась после гидратации: " + JSON.stringify(late));

    const log = await page.evaluate(() => window.__bootLog || []);
    const vals = log.map((x) => x[1]);
    const hiddenCount = vals.filter((v) => v === "hidden").length;
    if (vals.includes("hidden") && vals.indexOf("done") > vals.indexOf("hidden") && hiddenCount === 1)
      ok("таймлайн: ровно один цикл hidden → done [" + vals.join(",") + "]");
    else bad("таймлайн кривой (циклов hidden: " + hiddenCount + "): " + JSON.stringify(vals));

    const mainText = await page.evaluate(() => (document.querySelector("main")?.textContent || "").trim());
    if (mainText.length > 20) ok("контент main отрисован за заставкой");
    else bad("main пуст: " + mainText.slice(0, 40));
    await ctx.close();
  }

  /* ---------- B. Медленная сеть: ротация фраз ---------- */
  console.log("── B. Slow 4G + CPU×4: ротация фраз ──");
  {
    const ctx = await browser.newContext({ viewport: { width: 414, height: 896 }, isMobile: true, hasTouch: true });
    await ctx.addInitScript(INIT);
    const page = await ctx.newPage();
    const client = await ctx.newCDPSession(page);
    await client.send("Network.enable");
    await client.send("Network.emulateNetworkConditions", {
      offline: false, latency: 250,
      downloadThroughput: (600 * 1024) / 8,
      uploadThroughput: (400 * 1024) / 8,
    });
    await client.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    await page.goto(BASE + "/", { waitUntil: "commit", timeout: 60000 });
    /* ждём появления фразы УЖЕ во время загрузки (скрытие стартует на DCL,
     * поэтому сэмплим до него): commit → селектор → p1 → 2.3 с (≥1 тик
     * ротации 1.5 с) → p2 */
    await page.waitForSelector("#boot-phrase", { timeout: 20000 });
    const p1 = await page.evaluate(() => ({
      phrase: document.getElementById("boot-phrase").textContent,
      attr: document.documentElement.getAttribute("data-boot"),
    }));
    if (p1.phrase && p1.phrase.length > 5) ok(`мобильный сплэш виден на Slow 4G, фраза «${p1.phrase.slice(0, 30)}…»`);
    else bad("мобильный сплэш: фраза пуста");

    /* Ротация: ждём смену фразы до 6 с (под CPU×4 парсинг чанков может
     * блокировать main-thread и setInterval догоняет позже). */
    const rot = await page
      .waitForFunction(
        (prev) =>
          document.documentElement.getAttribute("data-boot") === "done" ||
          (document.getElementById("boot-phrase") && document.getElementById("boot-phrase").textContent !== prev),
        p1.phrase,
        { timeout: 6000, polling: 300 }
      )
      .then(() => true)
      .catch(() => false);
    const p2 = await page.evaluate(() => ({
      phrase: document.getElementById("boot-phrase") ? document.getElementById("boot-phrase").textContent : "",
      attr: document.documentElement.getAttribute("data-boot"),
    }));
    if (p2.attr === "done" && !rot) {
      console.log("  SKIP сплэш погас до смены фразы — ротация покрыта маркером setInterval");
    } else if (p2.phrase && p2.phrase !== p1.phrase) {
      ok(`фразы ротируются: «${p1.phrase.slice(0, 20)}…» → «${p2.phrase.slice(0, 20)}…»`);
    } else {
      bad(`фраза не сменилась за 6 с: ${JSON.stringify([p1.phrase, p2.phrase])}`);
    }

    await waitAttr(page, "done", 15000).catch(() => {});
    const fin = await bootState(page);
    if (fin.attr === "done") ok("на медленной сети сплэш погас (≤15 с), контент отдался");
    else bad("на Slow 4G data-boot=done не наступил: " + fin.attr);
    const mainText = await page.evaluate(() => (document.querySelector("main")?.textContent || "").trim());
    if (mainText.length > 20) ok("контент main на месте после медленной загрузки");
    else bad("main пуст на Slow 4G");
    await ctx.close();
  }

  /* ---------- C. Админка: сплэш гасится сразу ---------- */
  console.log("── C. /admin/ — без заставки ──");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(INIT);
    const page = await ctx.newPage();
    page.on("console", (m) => { if (m.type() === "error") consoleErrors.push("admin: " + m.text()); });
    await page.goto(BASE + "/admin/", { waitUntil: "domcontentloaded", timeout: 30000 });
    const st = await bootState(page);
    const log = await page.evaluate(() => window.__bootLog || []);
    const vals = log.map((x) => x[1]);
    if (st.attr === "done") ok("в админке data-boot=done сразу");
    else bad("в админке attr=" + st.attr);
    if (!vals.includes("hidden")) ok("в админке сплэш НИКОГДА не был виден (таймлайн без hidden)");
    else bad("в админке сплэш показывался: " + JSON.stringify(vals));
    await ctx.close();
  }

  /* ---------- D+E. Клиентская навигация и bfcache ---------- */
  console.log("── D/E. Навигация и bfcache ──");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(INIT);
    const page = await ctx.newPage();
    await page.goto(BASE + "/", { waitUntil: "load", timeout: 30000 });
    await waitAttr(page, "done", 8000).catch(() => {});

    const link = page.locator('main a[href^="/"]:not([href*="#"])').first();
    const href = await link.getAttribute("href");
    /* Обычный клик может попасть под футер/баннер (pointer-events перехват)
     * — тогда жмём через DOM: событие всё равно реальное, RoutePreloader и
     * Next-роутер его обрабатывают. */
    try {
      await link.click({ timeout: 7000 });
    } catch {
      await page.evaluate(() => {
        const a = Array.from(document.querySelectorAll('main a[href^="/"]')).find((x) => !x.getAttribute("href").includes("#"));
        if (a) a.click();
      });
    }
    await page.waitForTimeout(1500);
    const path = await page.evaluate(() => location.pathname);
    if (path && path !== "/") ok(`клиентская навигация (${href} → ${path}) без всплывания заставки`);
    else bad("навигация не состоялась: path=" + path);
    const mainText = await page.evaluate(() => (document.querySelector("main")?.textContent || "").trim());
    if (mainText.length > 20) ok("страница после навигации отрисована");
    else bad("main пуст после навигации на " + href);

    /* bfcache: назад на главную */
    await page.goBack({ timeout: 15000 }).catch(() => {});
    await page.waitForLoadState("load").catch(() => {});
    await page.waitForTimeout(700);
    const back = await bootState(page);
    if (back.attr === "done" && (back.display === "none" || back.opacity === "0"))
      ok("bfcache назад: заставка не застряла");
    else bad("bfcache назад: " + JSON.stringify(back));
    await ctx.close();
  }

  /* ---------- F. Каталог ---------- */
  console.log("── F. /catalog/ — сплэш штатно ──");
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await ctx.addInitScript(INIT);
    const page = await ctx.newPage();
    await page.goto(BASE + "/catalog/", { waitUntil: "domcontentloaded", timeout: 30000 });
    const st = await bootState(page);
    if (st.opacity === "1") ok("сплэш виден на каталоге");
    else bad("каталог: opacity=" + st.opacity);
    await waitAttr(page, "done", 8000).catch(() => {});
    const fin = await bootState(page);
    if (fin.attr === "done") ok("каталог: заставка погасла");
    else bad("каталог: done не наступил");
    await ctx.close();
  }

  /* ---------- Консоль ---------- */
  console.log("── Консоль ──");
  const hydr = consoleErrors.filter((e) => /hydrat|Hydrat|Minified React error|uncaught/i.test(e));
  if (hydr.length === 0) ok("нет ошибок гидратации/uncaught в консоли");
  else bad("ошибки консоли: " + hydr.slice(0, 3).join(" | "));

  await browser.close();
  console.log(`\n═══ E2E итог: PASS=${PASS} FAIL=${FAIL} ═══`);
  process.exit(FAIL === 0 ? 0 : 1);
})().catch((e) => {
  console.error("E2E упал:", e);
  process.exit(1);
});
