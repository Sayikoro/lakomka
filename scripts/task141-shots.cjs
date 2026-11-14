/* Task 141: скриншоты для визуальной проверки.
 * Главная (счётчик под hero), каталог (глазок + открытая модалка),
 * товар (кнопка «Поделиться» + меню), лендинг категории.
 * Запуск: node scripts/task141-shots.cjs http://127.0.0.1:8096
 */
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://127.0.0.1:8096";
const OUT = process.argv[3] || "/tmp/t141-shots";

(async () => {
  const fs = require("fs");
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

  // 1. Главная: счётчик сразу под hero
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/1-home-counter.png`, fullPage: false });
  await page.evaluate(() => document.querySelector('[data-testid="newyear-counter"]')?.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/2-home-counter-zoom.png`, fullPage: false });

  // 2. Каталог: глазок на карточке
  await page.goto(BASE + "/catalog/", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.hover('[data-testid="quick-view-btn"] >> nth=0').catch(() => {});
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/3-catalog-eyes.png`, fullPage: false });

  // 3. Модалка быстрого просмотра
  await page.locator('[data-testid="quick-view-btn"]').first().click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/4-quickview-modal.png`, fullPage: false });
  await page.keyboard.press("Escape");

  // 4. Товар: кнопка «Поделиться» и меню
  const slug = await page.evaluate(async () => {
    const r = await fetch("/api/products", { cache: "no-store" });
    const j = await r.json();
    return (j.data ?? [])[0]?.slug ?? "";
  });
  await page.goto(`${BASE}/product/${slug}/`, { waitUntil: "load" });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${OUT}/5-product-share.png`, fullPage: false });
  await page.locator('[data-testid="share-button"]').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/6-product-share-menu.png`, fullPage: false });

  // 5. Лендинг категории
  await page.goto(BASE + "/catalog/nabory/", { waitUntil: "load" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/7-category-landing.png`, fullPage: false });

  // 6. Телефон: главная + каталог (глазок виден без наведения)
  const mob = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await mob.goto(BASE + "/", { waitUntil: "load" });
  await mob.waitForTimeout(1500);
  await mob.screenshot({ path: `${OUT}/8-mobile-home.png`, fullPage: false });
  await mob.goto(BASE + "/catalog/", { waitUntil: "load" });
  await mob.waitForTimeout(1500);
  await mob.screenshot({ path: `${OUT}/9-mobile-catalog.png`, fullPage: false });

  await browser.close();
  console.log("shots done ->", OUT);
})();
