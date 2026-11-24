/* Task 159 e2e: каталог — пустая категория «Тубы» фильтруется честно.
 * До фикса: /catalog/tuby показывал ВЕСЬ каталог (категория без товаров
 * молча не фильтровалась), а плитки «Тубы» в фильтрах не было.
 *
 * Режимы:
 *   node scripts/task159-e2e.cjs <BASE>        — запечённые страницы + плитки/сброс
 *   node scripts/task159-e2e.cjs <BASE> live   — после назначения товара категории
 *                                                «Тубы» в БД пакета: живой каталог
 *                                                показывает товар и на лендинге, и
 *                                                через плитку/параметр.
 * Запуск (обёртка): bash scripts/task159-e2e.sh
 */
const { chromium } = require("playwright");
const BASE = process.argv[2] || "http://127.0.0.1:8096";
const MODE = process.argv[3] || "static";

let fails = 0;
const check = (name, cond, got) => {
  if (cond) console.log(`  OK  ${name}${got !== undefined ? `: ${got}` : ""}`);
  else { fails++; console.log(`  FAIL ${name}${got !== undefined ? `: ${JSON.stringify(got)}` : ""}`); }
};

const pageState = () => ({
  productLinks: document.querySelectorAll('a[href^="/product/"]').length,
  empty: document.querySelector('[data-testid="catalog-empty"]')
    ? document.querySelector('[data-testid="catalog-empty"]').textContent.trim()
    : null,
  pages: (document.querySelector("section div.mb-4 > div")?.textContent || "").trim(),
  tubyTile: Array.from(document.querySelectorAll("aside button")).some(
    (b) => (b.textContent || "").trim() === "Тубы"
  ),
});

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const s15 = () => p.evaluate(pageState);

  if (MODE === "live") {
    /* Живой путь: товар назначен категории «Тубы» в БД пакета. Запечённая
       страница пуста, но после монтирования живой /api/products приносит
       товар — сетка заполняется, пустое состояние исчезает. */
    await p.goto(`${BASE}/catalog/tuby/`, { waitUntil: "load", timeout: 30000 });
    await p
      .waitForFunction(
        () => document.querySelectorAll('a[href^="/product/"]').length >= 1,
        { timeout: 10000 }
      )
      .catch(() => {});
    const s = await s15();
    check("live: /catalog/tuby — товар появился из живого API", s.productLinks >= 1, s.productLinks);
    check("live: /catalog/tuby — пустое состояние исчезло", s.empty === null, s.empty);

    await p.goto(`${BASE}/catalog/?category=tuby`, { waitUntil: "load", timeout: 30000 });
    await p
      .waitForFunction(
        () => document.querySelectorAll('a[href^="/product/"]').length >= 1,
        { timeout: 10000 }
      )
      .catch(() => {});
    const s2 = await s15();
    check("live: /catalog/?category=tuby — товар есть", s2.productLinks >= 1, s2.productLinks);
    check("live: ?category=tuby — пустого состояния нет", s2.empty === null, s2.empty);

    await browser.close();
    if (fails) { console.log(`ПРОВАЛЕНО проверок: ${fails}`); process.exit(1); }
    console.log("Живые проверки Task 159 зелёные");
    process.exit(0);
  }

  /* 1) Лендинг пустой категории: пустое состояние вместо всего каталога */
  await p.goto(`${BASE}/catalog/tuby/`, { waitUntil: "load", timeout: 30000 });
  await p.waitForTimeout(1500);
  let s = await s15();
  check("/catalog/tuby — товаров 0 (до фикса был весь каталог)", s.productLinks === 0, s.productLinks);
  check("/catalog/tuby — пустое состояние называет «Тубы»", !!s.empty && s.empty.includes("Тубы"), s.empty);

  /* 2) Полный каталог: плитка «Тубы» в фильтрах, клик фильтрует, сброс возвращает */
  await p.goto(`${BASE}/catalog/`, { waitUntil: "load", timeout: 30000 });
  await p.waitForTimeout(1500);
  s = await s15();
  check("/catalog — товары на месте (регресс)", s.productLinks > 0, s.productLinks);
  check("/catalog — плитка «Тубы» есть в фильтрах (до фикса её не было)", s.tubyTile, s.tubyTile);
  const fullPages = s.pages;
  check("/catalog — счётчик страниц читается", /из\s*\d+$/.test(fullPages), fullPages);

  await p.click('aside button:has-text("Тубы")');
  await p.waitForTimeout(800);
  s = await s15();
  check("клик «Тубы» — пустое состояние с названием категории", !!s.empty && s.empty.includes("Тубы"), s.empty);
  check("клик «Тубы» — товаров 0 (а не весь каталог)", s.productLinks === 0, s.productLinks);
  check("клик «Тубы» — адрес синхронизирован ?category=tuby", p.url().includes("category=tuby"), p.url());

  await p.click('aside button:has-text("Сбросить")');
  await p.waitForTimeout(800);
  s = await s15();
  check("сброс — товары вернулись", s.productLinks > 0, s.productLinks);
  check("сброс — ?category удалён из адреса", !p.url().includes("category="), p.url());

  /* 3) Старый параметр ?category= с непустой категорией работает как раньше */
  await p.goto(`${BASE}/catalog/?category=zhest`, { waitUntil: "load", timeout: 30000 });
  await p.waitForTimeout(1500);
  s = await s15();
  check("?category=zhest — товары есть (старые ссылки живы)", s.productLinks > 0, s.productLinks);
  check("?category=zhest — фильтр сузил каталог (страниц меньше)", s.pages !== fullPages, `${s.pages} vs ${fullPages}`);
  check("?category=zhest — пустого состояния нет", s.empty === null, s.empty);

  /* 4) Лендинг непустой категории — регресс Task 141 */
  await p.goto(`${BASE}/catalog/zhest/`, { waitUntil: "load", timeout: 30000 });
  await p.waitForTimeout(1500);
  s = await s15();
  check("/catalog/zhest — товары на месте", s.productLinks > 0, s.productLinks);
  check("/catalog/zhest — пустого состояния нет", s.empty === null, s.empty);

  await browser.close();
  if (fails) { console.log(`ПРОВАЛЕНО проверок: ${fails}`); process.exit(1); }
  console.log("Все проверки Task 159 зелёные");
  process.exit(0);
})();
