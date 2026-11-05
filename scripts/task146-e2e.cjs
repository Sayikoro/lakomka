/* Task 146 E2E: галереи из админки + шорткод [gallery слаг].
 * A) Главная: блок «конфеты от фабрик» из галереи fabriki — 18 картинок
 *    в порядке манифеста, все живые (naturalWidth>0), alt из имён файлов.
 * B) Живое обновление без пересборки: файл добавили в папку галереи на
 *    сервере → F5 → блок показывает 19; удалили → снова 18.
 * C) Настройка brands_gallery: шорткод работает; битый слаг → встроенный
 *    набор (mock), блок не пустеет; пусто → дефолтная fabriki.
 * D) seo_text категории: [gallery fabriki] превращается в сетку картинок
 *    между текстом (RichText).
 * E) Админка: вкладка «Галерея» на странице «Файлы» — список галерей,
 *    чип шорткода [gallery fabriki], плитки картинок с кнопками.
 * F) Мобильный 390: блок фабрик без горизонтального скролла.
 * G) Консоль браузера чиста.
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = process.argv[2] || "http://127.0.0.1:8098";
/* Корень стенда .deploy-package — правим файлы галереи на ФС стенда (копия) */
const PKG = process.argv[3] || path.join(__dirname, "..", ".deploy-package");
const GAL = path.join(PKG, "uploads", "galleries", "fabriki");

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log("  OK  " + m); };
const bad = (m) => { fail++; console.log("  FAIL " + m); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  const api = async (path, opts = {}) =>
    page.evaluate(
      ({ path, opts }) =>
        fetch(path, { cache: "no-store", ...opts }).then(async (r) => ({
          status: r.status,
          json: await r.json().catch(() => null),
        })),
      { path, opts }
    );

  /* ── A. Блок фабрик из галереи ── */
  console.log("── A. Блок фабрик из галереи fabriki ──");
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(2500); // живое обновление успело отработать
  const logos = page.locator('[data-testid="brand-logos"] [data-testid="brand-logo"] img');
  const n = await logos.count();
  if (n === 18) ok("блок фабрик: 18 логотипов"); else bad(`блок фабрик: ${n} логотипов, ожидалось 18`);
  const alive = await logos.evaluateAll((imgs) => imgs.filter((i) => i.naturalWidth > 0).length);
  if (alive === 18) ok("все 18 картинок живые (naturalWidth>0)"); else bad(`живых ${alive}/18`);
  const fromGallery = await logos.evaluateAll((imgs) =>
    imgs.filter((i) => i.src.includes("/uploads/galleries/fabriki/")).length
  );
  if (fromGallery === 18) ok("все логотипы из /uploads/galleries/fabriki"); else bad(`из галереи ${fromGallery}/18`);
  const alt1 = await logos.first().getAttribute("alt");
  if (alt1 === "Конти") ok("порядок манифеста: первый — «Конти»"); else bad(`первый alt: ${alt1}`);
  const altLast = await logos.nth(17).getAttribute("alt");
  if (altLast === "СибБелка") ok("последний — «СибБелка»"); else bad(`последний alt: ${altLast}`);

  /* ── B. Живое обновление без пересборки ── */
  console.log("── B. Живое обновление галереи ──");
  fs.copyFileSync(path.join(GAL, "Жако.png"), path.join(GAL, "ZZ Тестовая.png"));
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(2200);
  const n19 = await logos.count();
  if (n19 === 19) ok("добавили файл на ФС → F5 → блок показал 19"); else bad(`после добавления: ${n19}, ожидалось 19`);
  const altNew = await logos.nth(18).getAttribute("alt");
  if (altNew === "ZZ Тестовая") ok("новый файл в конце (alt из имени)"); else bad(`новый не в конце: ${altNew}`);
  fs.unlinkSync(path.join(GAL, "ZZ Тестовая.png"));
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(2200);
  const nBack = await logos.count();
  if (nBack === 18) ok("удалили файл → F5 → снова 18"); else bad(`после удаления: ${nBack}, ожидалось 18`);

  /* ── C. Настройка brands_gallery ── */
  console.log("── C. Настройка brands_gallery ──");
  const login = await api("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@lakomka.local", password: "Lakomka2026!" }),
  });
  if (login.status === 200) ok("админ-API доступен (логин)"); else bad("логин не прошёл: " + login.status);

  await api("/api/admin/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brands_gallery: "[gallery fabriki]" }),
  });
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  const nSet = await logos.count();
  if (nSet === 18) ok("шорткод [gallery fabriki] в настройке — блок из галереи"); else bad(`с явным шорткодом: ${nSet}`);

  await api("/api/admin/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brands_gallery: "[gallery no-such-gallery]" }),
  });
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  const nMock = await logos.count();
  const srcsMock = await logos.evaluateAll((imgs) => imgs.map((i) => i.src));
  if (nMock === 18 && srcsMock.every((s) => !s.includes("/galleries/")))
    ok("галереи нет → встроенный набор (18, без /galleries/)"); else bad(`битый слаг: ${nMock} шт, src0=${srcsMock[0]}`);

  await api("/api/admin/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brands_gallery: "" }),
  });
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  const nDef = await logos.count();
  if (nDef === 18) ok("пустая настройка → дефолтная fabriki (18)"); else bad(`пустая настройка: ${nDef}`);

  /* ── D. seo_text категории ── */
  console.log("── D. Шорткод в seo_text категории ──");
  const cat = await api("/api/categories");
  const catSlug = cat.json?.data?.[0]?.slug;
  const catSeo = cat.json?.data?.[0]?.seo_text ?? "";
  if (!catSlug) { bad("нет категорий в API"); }
  else {
    const catId = cat.json.data[0].id;
    const newText = "Красивый текст до галереи. [gallery fabriki] Текст после галереи.";
    const put = await api(`/api/admin/categories/${catId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seo_text: newText }),
    });
    if (put.status === 200) ok("seo_text категории сохранён через админ-API"); else bad("сохранение seo_text: " + put.status);
    await page.goto(`${BASE}/catalog/${catSlug}/`, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const seo = page.locator('[data-testid="category-seo-text"]');
    if ((await seo.count()) === 1) ok("seo_text отрендерен (RichText)"); else bad("нет seo_text на странице");
    const gal = page.locator('[data-testid="category-seo-text"] [data-testid="gallery-block"] img');
    const galN = await gal.count();
    if (galN === 18) ok("шорткод внутри seo_text → 18 картинок"); else bad(`в seo_text: ${galN} картинок`);
    const aliveGal = await gal.evaluateAll((imgs) => imgs.filter((i) => i.naturalWidth > 0).length);
    if (aliveGal === 18) ok("все картинки seo_text-галереи живые"); else bad(`живых ${aliveGal}/18`);
    const txt = (await seo.innerText()).replace(/\s+/g, " ");
    if (txt.includes("Красивый текст до галереи.") && txt.includes("Текст после галереи.") && !txt.includes("[gallery"))
      ok("текст вокруг шорткода на месте, сам шорткод не торчит"); else bad("текст вокруг шорткода сломан: " + txt.slice(0, 120));
    await api(`/api/admin/categories/${catId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seo_text: catSeo }),
    });
  }

  /* ── E. Админка: вкладка «Галерея» ── */
  console.log("── E. Админка: вкладка «Галерея» ──");
  await page.goto(BASE + "/admin/files", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  if ((await page.locator('[data-testid="files-tab-gallery"]').count()) === 1)
    ok("вкладка «Галерея» на странице Файлов"); else bad("нет вкладки Галерея");
  await page.click('[data-testid="files-tab-gallery"]');
  await page.waitForTimeout(1500);
  if ((await page.locator('[data-testid="gallery-manager"]').count()) === 1)
    ok("GalleryManager открылся"); else bad("нет GalleryManager");
  const card = page.locator('[data-testid="gallery-card-fabriki"]');
  if ((await card.count()) === 1) ok("галерея fabriki в списке"); else bad("нет карточки fabriki");
  if ((await page.locator('[data-testid="gallery-copy"] >> text=[gallery fabriki]').count()) >= 0) {
    const chip = (await page.locator('[data-testid="gallery-copy"]').innerText()).trim();
    if (chip === "[gallery fabriki]" || chip === "Скопировано ✓") ok("чип шорткода: [gallery fabriki]"); else bad("чип шорткода: " + chip);
  }
  const adminItems = await page.locator('[data-testid^="gallery-item-"]').count();
  if (adminItems === 18) ok("в админке 18 плиток картинок"); else bad(`в админке плиток: ${adminItems}`);
  // копирование шорткода
  await page.click('[data-testid="gallery-copy"]');
  await page.waitForTimeout(500);
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ""));
  const chipAfter = (await page.locator('[data-testid="gallery-copy"]').innerText()).trim();
  if (clip === "[gallery fabriki]" || chipAfter === "Скопировано ✓")
    ok(`копирование шорткода (${clip || chipAfter})`); else bad(`в буфере: ${JSON.stringify(clip)}, чип: ${chipAfter}`);

  /* ── F. Мобильный 390 ── */
  console.log("── F. Мобильный 390 ──");
  const mob = await ctx.newPage();
  await mob.setViewportSize({ width: 390, height: 844 });
  await mob.goto(BASE + "/", { waitUntil: "load" });
  await mob.waitForTimeout(2200);
  const overflow = await mob.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  if (overflow <= 0) ok("нет горизонтального скролла"); else bad(`горизонтальный скролл ${overflow}px`);
  const mobLogos = await mob.locator('[data-testid="brand-logos"] [data-testid="brand-logo"] img').count();
  if (mobLogos === 18) ok("на мобиле 18 логотипов"); else bad(`на мобиле: ${mobLogos}`);

  /* ── G. Консоль ── */
  console.log("── G. Консоль браузера ──");
  const errs = consoleErrors.filter((e) => !e.includes("401") && !e.includes("Failed to load resource"));
  if (errs.length === 0) ok("консоль чиста"); else bad("ошибки консоли: " + errs.slice(0, 3).join(" | "));

  await browser.close();
  console.log("");
  console.log(`ИТОГО: PASS=${pass} FAIL=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
