/* Task 158 e2e: три улучшения админки на живом стенде (:8098).
 * A) Логин админом (сид task153-e2e-seed.php).
 * B) Поиск в списке товаров БЕЗ УЧЁТА РЕГИСТРА: создаём товар
 *    «Е158 ПОДАРОК ЧЕК», вводим в поиск «подарок чек» (малыми) —
 *    строка находится; то же через прямой API-запрос в обоих регистрах.
 * C) Быстрые действия: «скрыть» одним кликом — товар исчезает из
 *    ПУБЛИЧНОГО каталога /api/products, метка «скрыт», кнопка меняется
 *    на «в каталог»; клик «в каталог» возвращает всё как было.
 * D) Форма товара: SEO-блок — скрывающаяся панель (свёрнут по умолчанию,
 *    раскрывается, статус «не заполнено» в шапке).
 * E) Страница «Товары»: блок «SEO категорий» — скрывающаяся панель.
 * Запуск: node scripts/task158-e2e.cjs http://127.0.0.1:8098
 */
const { chromium } = require("playwright");
const BASE = process.argv[2] || "http://127.0.0.1:8098";
const ADMIN = { email: "t153e-admin@lakomka.local", password: "T153e-Admin-2026!" };

let fails = 0;
const ok = (m) => console.log(`  OK  ${m}`);
const bad = (m) => { fails++; console.log(`  FAIL ${m}`); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();

  // ── A. Логин ──
  await p.goto(BASE + "/admin/login/", { waitUntil: "load", timeout: 30000 });
  const logged = await p.evaluate(async (creds) => {
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(creds),
    });
    return r.ok;
  }, ADMIN);
  logged ? ok("логин супер-админом") : bad("логин не прошёл");

  // ── B. Тест-товар через API ──
  const created = await p.evaluate(async () => {
    const r = await fetch("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: "Е158 ПОДАРОК ЧЕК", slug: "e158-check", type: "bundle",
        price_kopecks: 100000, stock_qty: 3,
        show_in_catalog: 1, is_published: 1,
      }),
    });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j.data : null;
  });
  const pid = created && created.id;
  pid ? ok(`тест-товар создан (id=${pid})`) : bad("тест-товар не создался");
  if (!pid) { console.log("ИТОГО: FAIL"); process.exit(1); }

  // публичный каталог видит товар ДО скрытия
  const inCatalogBefore = await p.evaluate(async (id) => {
    const j = await (await fetch("/api/products", { cache: "no-store" })).json();
    return (j.data ?? []).some((x) => x.id === id);
  }, pid);
  inCatalogBefore ? ok("товар в публичном каталоге до скрытия") : bad("до скрытия товара нет в /api/products");

  // ── C. Поиск без учёта регистра (интерфейс) ──
  await p.goto(BASE + "/admin/products/", { waitUntil: "load", timeout: 30000 });
  await p.waitForTimeout(2500);
  const search = p.locator('input[placeholder="Поиск по названию или SKU"]');
  await search.fill("подарок чек"); // МАЛЫМИ — товар назван КАПСОМ
  let found = false;
  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(500);
    found = await p.locator(`[data-testid="quick-hide-${pid}"]`).count() > 0;
    if (found) break;
  }
  found ? ok("поиск «подарок чек» (малыми) нашёл «Е158 ПОДАРОК ЧЕК» в таблице")
        : bad("поиск малыми не нашёл капс-товар — mb_lower не работает в UI");

  // прямой API-запрос в обоих регистрах
  const apiCases = await p.evaluate(async (id) => {
    const hit = async (q) => {
      const j = await (await fetch(`/api/admin/products?q=${encodeURIComponent(q)}`, { cache: "no-store" })).json();
      const arr = Array.isArray(j.data) ? j.data : (j.data?.data ?? []);
      return arr.some((x) => x.id === id);
    };
    return { lower: await hit("е158 подарок"), upper: await hit("Е158 ПОДАРОК"), mixed: await hit("Е158 подарок") };
  }, pid);
  apiCases.lower && apiCases.upper && apiCases.mixed
    ? ok("API-поиск находит товар в нижнем/верхнем/смешанном регистре")
    : bad(`API-поиск: ${JSON.stringify(apiCases)}`);

  // ── D. Быстрые действия: скрыть / вернуть ──
  const hideBtn = p.locator(`[data-testid="quick-hide-${pid}"]`);
  await hideBtn.scrollIntoViewIfNeeded();
  await hideBtn.click();
  let badgeShown = false, showBtnShown = false;
  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(400);
    badgeShown = await p.locator(`[data-testid="hidden-badge-${pid}"]`).count() > 0;
    showBtnShown = await p.locator(`[data-testid="quick-show-${pid}"]`).count() > 0;
    if (badgeShown && showBtnShown) break;
  }
  badgeShown && showBtnShown
    ? ok("после «скрыть»: метка «скрыт» + кнопка сменилась на «в каталог»")
    : bad(`после «скрыть»: метка=${badgeShown}, кнопка-вернуть=${showBtnShown}`);

  const flagsAfterHide = await p.evaluate(async (id) => {
    const j = await (await fetch(`/api/admin/products/${id}`, { cache: "no-store" })).json();
    return { cat: j.data.show_in_catalog, pub: j.data.is_published };
  }, pid);
  flagsAfterHide.cat === 0 && flagsAfterHide.pub === 0
    ? ok("в БД оба флага = 0 (show_in_catalog, is_published)")
    : bad(`флаги после скрытия: ${JSON.stringify(flagsAfterHide)}`);

  const inCatalogHidden = await p.evaluate(async (id) => {
    const j = await (await fetch("/api/products", { cache: "no-store" })).json();
    return (j.data ?? []).some((x) => x.id === id);
  }, pid);
  !inCatalogHidden
    ? ok("покупатель товар больше НЕ видит: /api/products без него")
    : bad("товар всё ещё в публичном каталоге после «скрыть»");

  const showBtn = p.locator(`[data-testid="quick-show-${pid}"]`);
  await showBtn.click();
  let restored = false;
  for (let i = 0; i < 20; i++) {
    await p.waitForTimeout(400);
    restored = await p.locator(`[data-testid="quick-hide-${pid}"]`).count() > 0
      && (await p.locator(`[data-testid="hidden-badge-${pid}"]`).count() === 0);
    if (restored) break;
  }
  restored ? ok("после «в каталог»: метка исчезла, кнопка вернулась") : bad("«в каталог» не вернул состояние");

  const flagsAfterShow = await p.evaluate(async (id) => {
    const j = await (await fetch(`/api/admin/products/${id}`, { cache: "no-store" })).json();
    return { cat: j.data.show_in_catalog, pub: j.data.is_published };
  }, pid);
  flagsAfterShow.cat === 1 && flagsAfterShow.pub === 1
    ? ok("в БД оба флага снова = 1")
    : bad(`флаги после возврата: ${JSON.stringify(flagsAfterShow)}`);

  const inCatalogAfter = await p.evaluate(async (id) => {
    const j = await (await fetch("/api/products", { cache: "no-store" })).json();
    return (j.data ?? []).some((x) => x.id === id);
  }, pid);
  inCatalogAfter ? ok("товар снова в публичном каталоге") : bad("после «в каталог» товара нет в /api/products");

  // ── E. Форма товара: SEO-панель ──
  await p.goto(BASE + `/admin/products/edit?id=${pid}`, { waitUntil: "load", timeout: 30000 });
  await p.waitForTimeout(2000);
  const seoToggle = p.locator('[data-testid="seo-panel-toggle"]');
  if ((await seoToggle.count()) === 0) bad("SEO-панель в форме товара не найдена");
  else {
    const collapsed = await seoToggle.getAttribute("aria-expanded");
    const contentHidden = (await p.locator('[data-testid="seo-panel-content"]').count()) === 0;
    collapsed === "false" && contentHidden
      ? ok("SEO-панель формы свёрнута по умолчанию")
      : bad(`SEO-панель по умолчанию: aria-expanded=${collapsed}, контент скрыт=${contentHidden}`);
    const headerText = await seoToggle.textContent();
    headerText.includes("не заполнено")
      ? ok("в шапке SEO-панели статус «не заполнено»")
      : bad(`шапка SEO-панели без статуса: «${headerText.trim().slice(0, 80)}»`);
    await seoToggle.click();
    await p.waitForTimeout(300);
    const opened = (await seoToggle.getAttribute("aria-expanded")) === "true"
      && (await p.locator('[data-testid="seo-panel-content"]').count()) === 1;
    opened ? ok("SEO-панель раскрывается, поля title/description доступны")
           : bad("SEO-панель не раскрылась");
    // закрываем обратно
    await seoToggle.click();
  }

  // ── F. «SEO категорий» — скрывающаяся панель на странице «Товары» ──
  await p.goto(BASE + "/admin/products/", { waitUntil: "load", timeout: 30000 });
  await p.waitForTimeout(1500);
  const panelToggle = p.locator('[data-testid="categories-seo-panel-toggle"]');
  if ((await panelToggle.count()) === 0) bad("панель «SEO категорий» не найдена");
  else {
    const collapsed = await panelToggle.getAttribute("aria-expanded");
    const listHidden = (await p.locator('[data-testid="categories-seo-list"]').count()) === 0;
    collapsed === "false" && listHidden
      ? ok("«SEO категорий» свёрнута по умолчанию — таблица сразу видна")
      : bad(`«SEO категорий»: aria-expanded=${collapsed}, список скрыт=${listHidden}`);
    await panelToggle.click();
    await p.waitForTimeout(400);
    const items = await p.locator('[data-testid^="categories-seo-item-"]').count();
    const opened = (await panelToggle.getAttribute("aria-expanded")) === "true" && items > 0;
    opened ? ok(`панель раскрывается, категорий в списке: ${items}`) : bad("панель «SEO категорий» не раскрылась");
    await panelToggle.click();
    await p.waitForTimeout(200);
    const closedAgain = (await p.locator('[data-testid="categories-seo-list"]').count()) === 0;
    closedAgain ? ok("панель закрывается обратно") : bad("панель не закрылась");
  }

  // ── уборка: тест-товар удаляем навсегда ──
  const cleaned = await p.evaluate(async (id) => {
    await fetch(`/api/admin/products/${id}`, { method: "DELETE", credentials: "include" });
    const r = await fetch(`/api/admin/products/${id}?force=1`, { method: "DELETE", credentials: "include" });
    return r.ok;
  }, pid);
  cleaned ? ok("тест-товар удалён из пакетной БД") : bad("уборка тест-товара не удалась");

  await browser.close();
  console.log("");
  console.log(`ИТОГО: ${fails === 0 ? "ВСЕ ПРОВЕРКИ ЗЕЛЁНЫЕ" : `ПРОВАЛОВ: ${fails}`}`);
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.log(`  FATAL ${e.message}`); process.exit(1); });
