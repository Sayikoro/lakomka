/* Task 160 e2e: «Тубы» и «Без категории» в админке на живом стенде (:8099).
 * A) Логин админом (сид task153-e2e-seed.php).
 * B) Страница «Товары»: плитка «Без категории» (cat-none-tile) на месте,
 *    плитка «Тубы» присутствует (пустая категория больше не исчезает).
 * C) Клик «Без категории» → fetch category=none → все строки без
 *    category_id, total совпадает с ожиданием пакета; таблица не пуста.
 * D) Клик «Тубы» → fetch category=8 → total 0, честное «Ничего не найдено».
 * E) Клик «Картон» → fetch category=<id> → все строки этой категории
 *    (регресс обычного фильтра).
 * F) «Сбросить фильтры» → fetch без category → mixed rows, «Все» нажата.
 * Запуск: node scripts/task160-e2e.cjs http://127.0.0.1:8099
 */
const { chromium } = require("playwright");
const BASE = process.argv[2] || "http://127.0.0.1:8099";
const ADMIN = { email: "t153e-admin@lakomka.local", password: "T153e-Admin-2026!" };
// Ожидания для пакетной БД .deploy-package (проверяется ниже по API):
// пустых категорий (category_id NULL/0) должно быть > 0, «Тубы» (id=8) — 0.

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

  // ── B. Страница «Товары»: плитки ──
  await p.goto(BASE + "/admin/products/", { waitUntil: "load", timeout: 30000 });
  await p.waitForSelector('[data-testid="cat-none-tile"]', { timeout: 20000 })
    .then(() => ok("плитка «Без категории» отрисована (cat-none-tile)"))
    .catch(() => bad("плитка «Без категории» не найдена"));

  // «Тубы» — отдельная кнопка категории (пустая категория больше не исчезает)
  const tubyTile = p.locator('button:has-text("Тубы")');
  const tubyCount = await tubyTile.count();
  tubyCount >= 1 ? ok(`плитка «Тубы» присутствует в фильтре (${tubyCount} шт)`) : bad("плитки «Тубы» нет (пустые категории исчезают)");
  // и она ещё НЕ нажата
  const tubyPressed = await tubyTile.first().getAttribute("aria-pressed");
  tubyPressed === "false" ? ok("«Тубы» до клика не активна") : bad("«Тубы» активна до клика");

  // ── C. Клик «Без категории» ──
  const noneRespP = p.waitForResponse(
    (r) => r.url().includes("/api/admin/products") && r.url().includes("category=none"),
    { timeout: 15000 }
  );
  await p.click('[data-testid="cat-none-tile"]');
  const noneResp = await noneRespP;
  const noneJson = await noneResp.json();
  const noneRows = noneJson.data || [];
  const noneTotal = noneJson.total;
  noneRows.length > 0 ? ok(`category=none: ${noneRows.length} строк на странице, total=${noneTotal}`) : bad("category=none: пусто");
  const badCat = noneRows.filter((x) => !(x.category_id === null || x.category_id === 0)).length;
  badCat === 0 ? ok("category=none: у всех строк category_id пуст") : bad(`category=none: ${badCat} строк с категорией протекает`);
  noneTotal > 0 ? ok(`category=none: total=${noneTotal} — «без категории» реально много товаров`) : bad("category=none: total=0");
  const nonePressed = await p.getAttribute('[data-testid="cat-none-tile"]', "aria-pressed");
  nonePressed === "true" ? ok("плитка «Без категории» активна (aria-pressed)") : bad("плитка «Без категории» не активна");

  // ── D. Клик «Тубы» ──
  const tubyRespP = p.waitForResponse(
    (r) => r.url().includes("/api/admin/products") && /[?&]category=8(&|$)/.test(r.url()),
    { timeout: 15000 }
  );
  await tubyTile.first().click();
  const tubyResp = await tubyRespP;
  const tubyJson = await tubyResp.json();
  (tubyJson.total === 0 && !(tubyJson.data || []).length)
    ? ok("category=8 («Тубы» пустая): честный пустой результат (total=0)")
    : bad(`category=8: total=${tubyJson.total} — не пусто`);
  await p.waitForSelector("text=Ничего не найдено", { timeout: 10000 })
    .then(() => ok("пустая категория: показано «Ничего не найдено»"))
    .catch(() => bad("пустое состояние не показано"));
  const tubyPressedAfter = await tubyTile.first().getAttribute("aria-pressed");
  tubyPressedAfter === "true" ? ok("плитка «Тубы» активна после клика") : bad("плитка «Тубы» не активна после клика");

  // ── E. Клик «Картон» (регресс обычного фильтра) ──
  const kartonTile = p.locator('button:has-text("Картон")');
  if ((await kartonTile.count()) > 0) {
    const kartonRespP = p.waitForResponse(
      (r) => r.url().includes("/api/admin/products") && /[?&]category=(\d+)(&|$)/.test(r.url()) && !r.url().includes("category=none"),
      { timeout: 15000 }
    );
    await kartonTile.first().click();
    const kartonResp = await kartonRespP;
    const kartonJson = await kartonResp.json();
    const cid = Number((kartonResp.url().match(/[?&]category=(\d+)/) || [])[1]);
    const kartonRows = kartonJson.data || [];
    const allMatch = kartonRows.every((x) => x.category_id === cid);
    kartonJson.total > 0 && allMatch
      ? ok(`категория id=${cid}: total=${kartonJson.total}, все строки этой категории (регресс чист)`)
      : bad(`категория id=${cid}: total=${kartonJson.total}, allMatch=${allMatch}`);
  } else {
    bad("плитка «Картон» не найдена");
  }

  // ── F. Сброс фильтров ──
  const resetRespP = p.waitForResponse(
    (r) => r.url().includes("/api/admin/products") && !/[?&]category=/.test(r.url()),
    { timeout: 15000 }
  );
  await p.click('button:has-text("Сбросить фильтры")');
  const resetResp = await resetRespP;
  const resetJson = await resetResp.json();
  const resetRows = resetJson.data || [];
  const mixed = resetRows.some((x) => x.category_id === null) && resetRows.some((x) => x.category_id !== null);
  resetRows.length > 0
    ? ok(`сброс: fetch без category, ${resetRows.length} строк (смешанные: ${mixed ? "да" : "нет — страница может начинаться с категорийных"})`)
    : bad("сброс: пусто");
  const nonePressedAfter = await p.getAttribute('[data-testid="cat-none-tile"]', "aria-pressed");
  nonePressedAfter === "false" ? ok("«Без категории» после сброса не активна") : bad("«Без категории» осталась активной после сброса");

  await browser.close();
  console.log(fails === 0 ? "  ИТОГО: всё зелёное" : `  ИТОГО: провалов: ${fails}`);
  process.exit(fails === 0 ? 0 : 1);
})().catch((e) => { console.log("  FAIL скрипт упал:", e.message); process.exit(1); });
