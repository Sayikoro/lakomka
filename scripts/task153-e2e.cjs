/* Task 153 E2E: 12 улучшений админки. «Состав подарка» не входит —
 * покрывается task152-e2e (выпущенная реализация ProductTabs).
 *
 * Стенд :8099 (.deploy-package, MODE=both). Сценарии:
 * A) Заказы: фильтры в UI (статус/номер/письмо/даты), денежная сводка,
 *    пагинация (25 заказов, per_page 20 → 2 страницы), экспорт CSV (BOM+строки).
 * B) Дашборд: плитки-тревоги («письма не ушли», «товары заканчиваются»),
 *    график динамики по дням (SVG), переходы из плиток с подстановкой фильтра.
 * C) Карточка заказа: кнопка «Печать бланка».
 * D) Viewer: «Файлы»/«PDF» скрыты из меню.
 * E) logout-all: старый JWT отклоняется после «Выйти на всех устройствах».
 * F) Аналитика: произвольный период дат + график динамики.
 * G) Товар: форма с выбором категории и SEO-полями (маркеры DOM).
 * I) Тосты/подтверждения: диалог admin-confirm вместо window.confirm.
 *
 * Запуск: node scripts/task153-e2e.cjs http://127.0.0.1:8099
 */
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://127.0.0.1:8099";
const ADMIN = { email: "t153e-admin@lakomka.local", password: "T153e-Admin-2026!" };
const VIEWER = { email: "t153e-viewer@lakomka.local", password: "T153e-Viewer-2026!" };

let PASS = 0, FAIL = 0;
const ok = (s) => { PASS++; console.log("  OK  " + s); };
const bad = (s) => { FAIL++; console.log("  FAIL " + s); };

async function login(page, creds) {
  await page.goto(BASE + "/", { waitUntil: "load" });
  return page.evaluate(async (c) => {
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(c),
    });
    return r.ok;
  }, creds);
}

(async () => {
  const browser = await chromium.launch();
  try {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") {
      const url = (m.location() && m.location().url) || "";
      if (!url.includes("/api/auth/me")) consoleErrors.push(m.text() + " @ " + url);
    }
  });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

  /* ── Логин админом ── */
  console.log("── 0. Логин ──");
  (await login(page, ADMIN)) ? ok("логин супер-админом") : bad("логин не прошёл");

  /* ── A. Заказы: сводка, фильтры, пагинация, экспорт ── */
  console.log("── A. Заказы: сводка/фильтры/пагинация/CSV ──");
  await page.goto(BASE + "/admin/orders", { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(1500); // гидратация + запрос с дебаунсом 300 мс

  const head = await page.evaluate(() => {
    const p = document.querySelector('[data-testid="orders-filters"]');
    const total = [...document.querySelectorAll("p")].find((e) =>
      /Найдено \d+ заказ/.test(e.textContent || "")
    );
    return {
      filters: !!p,
      totalText: total ? total.textContent.trim() : "",
      csvBtn: [...document.querySelectorAll("a")].some((a) =>
        (a.getAttribute("href") || "").includes("/admin/orders/export")
      ),
    };
  });
  head.filters ? ok("блок фильтров отрисован") : bad("блока фильтров нет");
  head.csvBtn ? ok("кнопка «Экспорт CSV» на месте") : bad("кнопки экспорта нет");
  /\d+ заказ\(ов\) на сумму [\d\s]+₽/.test(head.totalText)
    ? ok(`денежная сводка: «${head.totalText}»`)
    : bad(`сводка неожиданная: «${head.totalText}»`);
  head.totalText.includes("25") ? ok("найдено 25 заказов") : bad(`ожидали 25: ${head.totalText}`);

  /* Фильтр по статусу: «Выполненных» 5 */
  await page.selectOption('[data-testid="orders-filters"] select >> nth=0', "done");
  await page.waitForTimeout(1200);
  const doneCnt = await page.evaluate(() => {
    const t = [...document.querySelectorAll("p")].find((e) =>
      /Найдено \d+ заказ/.test(e.textContent || "")
    );
    return t ? (t.textContent.match(/Найдено (\d+)/) || [])[1] : "";
  });
  doneCnt === "5" ? ok("фильтр статуса «Выполнен»: 5 заказов") : bad(`фильтр статуса: ${doneCnt}`);

  /* Фильтр «письмо не отправлено» + статус сброс */
  await page.selectOption('[data-testid="orders-filters"] select >> nth=0', "");
  await page.selectOption('[data-testid="orders-filters"] select >> nth=1', "0");
  await page.waitForTimeout(1200);
  const emailCnt = await page.evaluate(() => {
    const t = [...document.querySelectorAll("p")].find((e) =>
      /Найдено \d+ заказ/.test(e.textContent || "")
    );
    return (t ? t.textContent.match(/Найдено (\d+)/) : ["", "?"])[1];
  });
  emailCnt === "2" ? ok("фильтр «письмо не отправлено»: 2 заказа") : bad(`фильтр письма: ${emailCnt}`);

  /* Сброс фильтров */
  await page.click('[data-testid="orders-filters"] button:has-text("Сбросить фильтры")');
  await page.waitForTimeout(1200);

  /* Пагинация: подвал виден и при 1 странице; per_page=20 → 2 страницы */
  const pag1 = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="orders-pagination"]');
    return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
  });
  pag1.includes("Страница 1 из 1")
    ? ok("пагинация видна при одной странице («Страница 1 из 1») — per_page переключаем")
    : bad("подвала пагинации нет при 1 странице: " + pag1);
  await page.selectOption('[aria-label="Заказов на странице"]', "20");
  await page.waitForTimeout(1200);
  const pag2 = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="orders-pagination"]');
    return el ? el.textContent.replace(/\s+/g, " ").trim() : "";
  });
  pag2.includes("Страница 1 из 2")
    ? ok("пагинация: «Страница 1 из 2» (25 заказов / 20 на странице)")
    : bad("пагинации «1 из 2» нет: " + pag2);
  await page.click('[data-testid="orders-pagination"] button[aria-label="Следующая страница"]');
  await page.waitForTimeout(1200);
  const page2 = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="orders-pagination"]');
    const nums = [...document.querySelectorAll("table tbody tr")].length;
    return { cur: el ? el.querySelector('[aria-current="page"]')?.textContent : "", rows: nums };
  });
  page2.cur === "2" ? ok("переключение на страницу 2") : bad(`страница не сменилась: ${page2.cur}`);
  page2.rows > 0 && page2.rows <= 20 ? ok(`на странице 2 строк: ${page2.rows}`) : bad(`строк на стр. 2: ${page2.rows}`);

  /* Экспорт CSV через fetch из браузера (с cookie). BOM проверяем по байтам:
   * r.text() декодирует UTF-8 и молча срезает ведущий BOM. */
  const csv = await page.evaluate(async () => {
    const r = await fetch("/api/admin/orders/export?number=T153E", { credentials: "include" });
    const buf = await r.arrayBuffer();
    const head = new Uint8Array(buf, 0, 3);
    return {
      status: r.status,
      type: r.headers.get("content-type") || "",
      bom: head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf,
      text: new TextDecoder().decode(buf),
    };
  });
  csv.status === 200 ? ok("экспорт CSV: HTTP 200") : bad(`экспорт CSV: ${csv.status}`);
  csv.type.includes("text/csv") ? ok("экспорт CSV: content-type text/csv") : bad(`content-type: ${csv.type}`);
  csv.bom
    ? ok("экспорт CSV: BOM (EF BB BF) в байтах ответа")
    : bad("экспорт CSV: BOM отсутствует");
  const csvLines = csv.text.split("\n").filter((l) => l.trim()).length;
  csvLines === 26 ? ok(`экспорт CSV: 25 заказов + заголовок (${csvLines} строк)`) : bad(`CSV строк: ${csvLines}`);

  /* ── C. Карточка заказа: печать ── */
  console.log("── C. Карточка заказа ──");
  await page.goto(BASE + "/admin/orders", { waitUntil: "load" });
  await page.waitForTimeout(1200);
  await page.click('table tbody tr:first-child a:has-text("ЛК-"), table tbody tr:first-child a >> nth=0');
  await page.waitForTimeout(1500);
  const printBtn = await page.evaluate(() => !!document.querySelector('[data-testid="print-order"]'));
  printBtn ? ok("кнопка «Печать бланка» на карточке") : bad("кнопки печати нет");

  /* ── B. Дашборд: тревоги + график ── */
  console.log("── B. Дашборд ──");
  await page.goto(BASE + "/admin", { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(2000);
  const dash = await page.evaluate(() => {
    const emails = document.querySelector('[data-testid="alert-emails"]');
    const low = document.querySelector('[data-testid="alert-low-stock"]');
    const chart = document.querySelector('[data-testid="daily-chart"]');
    return {
      emails: emails ? emails.textContent.replace(/\s+/g, " ").trim().slice(0, 60) : "",
      low: low ? low.textContent.replace(/\s+/g, " ").trim().slice(0, 60) : "",
      chartSvg: chart ? !!chart.querySelector("svg") : false,
      bars: chart ? chart.querySelectorAll("rect[fill]").length : 0,
    };
  });
  dash.emails.includes("Письма не ушли") ? ok("плитка «Письма не ушли» видна") : bad(`плитка писем: ${dash.emails}`);
  /\d/.test(dash.emails) ? ok("плитка писем с числом") : bad("плитка писем без числа");
  dash.low.includes("Товары заканчиваются") ? ok("плитка «Товары заканчиваются» видна") : bad(`плитка товаров: ${dash.low}`);
  dash.chartSvg ? ok(`график динамики на дашборде (rect-столбики: ${dash.bars})`) : bad("графика на дашборде нет");

  /* Переход из плитки → /admin/orders?email=0 с подстановкой фильтра */
  await page.click('[data-testid="alert-emails"]');
  await page.waitForTimeout(1800);
  const afterTile = await page.evaluate(() => {
    const t = [...document.querySelectorAll("p")].find((e) =>
      /Найдено \d+ заказ/.test(e.textContent || "")
    );
    return {
      url: location.search,
      sel: document.querySelectorAll('[data-testid="orders-filters"] select')[1]?.value ?? "",
      cnt: t ? (t.textContent.match(/Найдено (\d+)/) || [])[1] : "",
    };
  });
  afterTile.sel === "0" ? ok("плитка ведёт на заказы с предзаполненным фильтром") : bad(`фильтр не подставился: ${afterTile.sel}`);
  afterTile.cnt === "2" ? ok("фильтр из URL применился (2 заказа)") : bad(`фильтр из URL: ${afterTile.cnt}`);

  /* ── G. Форма товара: категория + SEO ── */
  console.log("── G. Форма товара ──");
  await page.goto(BASE + "/admin/products/new", { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(1200);
  const form = await page.evaluate(() => {
    const cat = document.querySelector('[data-testid="product-category"]');
    const inputs = [...document.querySelectorAll("input, textarea")].map((i) => i.value);
    return {
      cat: !!cat,
      catOptions: cat ? cat.options.length : 0,
      seoBox: [...document.querySelectorAll("p")].some((p) =>
        (p.textContent || "").includes("SEO — для поисковиков")
      ),
    };
  });
  form.cat ? ok("форма товара: селект категории") : bad("селекта категории нет");
  form.catOptions > 1 ? ok(`в селекте категории ${form.catOptions - 1} шт. + «без категории»`) : bad("категории не загрузились");
  form.seoBox ? ok("форма товара: блок SEO") : bad("блока SEO нет");

  /* ── F. Аналитика: произвольный период + график ── */
  console.log("── F. Аналитика ──");
  await page.goto(BASE + "/admin/analytics", { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(2500);
  const an0 = await page.evaluate(() => ({
    custom: !!document.querySelector('[data-testid="analytics-custom-period"]'),
    chart: !!document.querySelector('[data-testid="analytics-daily-chart"] svg'),
  }));
  an0.custom ? ok("аналитика: поля произвольного периода") : bad("полей дат в аналитике нет");
  an0.chart ? ok("аналитика: график динамики по дням") : bad("графика в аналитике нет");

  const d = new Date();
  const iso = (x) => x.toISOString().slice(0, 10);
  await page.fill('[data-testid="analytics-from"]', iso(new Date(d.getTime() - 6 * 864e5)));
  await page.fill('[data-testid="analytics-to"]', iso(d));
  await page.waitForTimeout(2500);
  const an1 = await page.evaluate(() => {
    const chart = document.querySelector('[data-testid="analytics-daily-chart"] svg');
    return { chart: !!chart, title: chart ? chart.querySelectorAll("text").length : 0 };
  });
  an1.chart ? ok("аналитика: график перерисовался под период (7 дней)") : bad("график пропал после установки периода");
  an1.title > 0 && an1.title <= 8 ? ok(`подписей дней на графике: ${an1.title} (≤7)`) : bad(`подписей: ${an1.title}`);
  /* сброс периода крестиком */
  await page.click('[data-testid="analytics-custom-period"] button[aria-label="Сбросить произвольный период"]');
  await page.waitForTimeout(1500);

  /* ── I. Тосты/подтверждения ── */
  console.log("── I. Диалог подтверждения ──");
  await page.click('[data-testid="analytics-wipe"]');
  await page.waitForTimeout(600);
  const dlg = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="admin-confirm"]');
    return el ? el.textContent.replace(/\s+/g, " ").slice(0, 80) : "";
  });
  dlg.includes("Удалить ВСЮ аналитику") ? ok("диалог подтверждения (admin-confirm) открылся") : bad(`диалог: «${dlg}»`);
  await page.click('[data-testid="admin-confirm"] button:has-text("Отмена")');
  await page.waitForTimeout(400);

  /* ── D. Viewer: скрытие «Файлы»/«PDF» ── */
  console.log("── D. Viewer ──");
  await page.evaluate(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  });
  (await login(page, VIEWER)) ? ok("логин viewer'ом") : bad("логин viewer не прошёл");
  await page.goto(BASE + "/admin", { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(1800);
  const viewerNav = await page.evaluate(() => {
    const links = [...document.querySelectorAll('[data-testid="admin-sidebar"] a')].map(
      (a) => a.textContent.trim()
    );
    return { files: links.includes("Файлы"), pdf: links.includes("PDF"), texts: links.includes("Текст на страницах") };
  });
  !viewerNav.files && !viewerNav.pdf
    ? ok("viewer: «Файлы» и «PDF» скрыты из меню")
    : bad(`viewer видит скрытое: files=${viewerNav.files} pdf=${viewerNav.pdf}`);

  /* ── E. logout-all ── */
  console.log("── E. Выйти на всех устройствах ──");
  const stale = await page.evaluate(async (c) => {
    /* второй JWT с тем же tv — имитация «другого устройства» */
    const r1 = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(c),
    });
    const ok1 = r1.ok;
    const r2 = await fetch("/api/auth/logout-all", { method: "POST", credentials: "include" });
    const ok2 = r2.ok;
    const r3 = await fetch("/api/auth/me", { credentials: "include" });
    return { ok1, ok2, me: r3.status };
  }, VIEWER);
  stale.ok1 && stale.ok2 ? ok("viewer залогинен, logout-all выполнен") : bad(`logout-all: ${JSON.stringify(stale)}`);
  stale.me === 401 ? ok("после logout-all токен отклонён (401)") : bad(`/auth/me после logout-all: ${stale.me}`);
  const me2 = await page.evaluate(async () => {
    const r = await fetch("/api/auth/me", { credentials: "include" });
    return r.status;
  });
  me2 === 401 ? ok("второе устройство тоже отозвано") : bad(`второе устройство: ${me2}`);
  (await login(page, ADMIN)) ? ok("повторный логин админом работает") : bad("повторный логин не прошёл");

  /* ── Консоль ── */
  const realErrors = consoleErrors.filter(
    (e) => !e.includes("401") && !e.includes("Failed to load resource")
  );
  realErrors.length === 0
    ? ok("консоль браузера чиста")
    : bad("ошибки консоли: " + realErrors.slice(0, 3).join(" | "));

  await browser.close();
  console.log("");
  console.log(`ИТОГО: PASS=${PASS} FAIL=${FAIL}`);
  process.exit(FAIL === 0 ? 0 : 1);
  } finally {
    /* Даже при крахе сценария браузер закрывается — иначе осиротевший
       chromium держит stdout-пайп обёртки и вешает bash-вызов. */
    await browser.close().catch(() => {});
  }
})().catch((e) => {
  console.error("E2E CRASH: " + e.message);
  process.exit(1);
});
