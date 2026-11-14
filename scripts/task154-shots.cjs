/* Task 154 скриншоты: степпер с вводом количества.
 * 1) карточка товара 1280 — инпут в блоке «В корзину»;
 * 2) /cart 1280 — в поле напечатано 100;
 * 3) телефон 390 — открытая шторка, поле количества.
 * Запуск: node scripts/task154-shots.cjs http://127.0.0.1:8096
 */
const { chromium } = require("playwright");
const BASE = process.argv[2] || "http://127.0.0.1:8096";

(async () => {
  const browser = await chromium.launch();
  const shot = (n) => `/tmp/t154-shot-${n}.png`;

  // 1. Карточка товара, десктоп
  const ctx1 = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const p1 = await ctx1.newPage();
  await p1.goto(BASE + "/", { waitUntil: "load", timeout: 30000 });
  const slug = await p1.evaluate(async () => {
    const r = await fetch("/api/products", { cache: "no-store" });
    const j = await r.json();
    return (j.data ?? []).find((p) => p.show_in_catalog === 1)?.slug ?? "";
  });
  await p1.goto(`${BASE}/product/${slug}/`, { waitUntil: "load", timeout: 30000 });
  await p1.waitForTimeout(1200);
  const inp = p1.locator('input[aria-label="Количество"]');
  await inp.scrollIntoViewIfNeeded();
  await inp.fill("100");
  await inp.locator("xpath=ancestor::div[1]/following-sibling::button[1]").click();
  await p1.waitForTimeout(600);
  await p1.screenshot({ path: shot(1) });
  console.log("shot1:", shot(1));

  // 2. /cart, десктоп (ждём скрытия BootSplash ~1.3 с)
  await p1.goto(`${BASE}/cart/`, { waitUntil: "load", timeout: 30000 });
  await p1.waitForTimeout(2500);
  await p1.screenshot({ path: shot(2) });
  console.log("shot2:", shot(2));
  await ctx1.close();

  // 3. Телефон 390: шторка с полем количества
  const ctx2 = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/product/${slug}/`, { waitUntil: "load", timeout: 30000 });
  await p2.waitForTimeout(1200);
  await p2.locator('input[aria-label="Количество"]').fill("25");
  const addBtn = p2.locator('input[aria-label="Количество"]').locator("xpath=ancestor::div[1]/following-sibling::button[1]");
  await addBtn.click();
  await p2.waitForTimeout(600);
  await p2.locator('header button[aria-label="Корзина"]:visible').click();
  await p2.waitForTimeout(700);
  await p2.screenshot({ path: shot(3) });
  console.log("shot3:", shot(3));
  await ctx2.close();

  await browser.close();
})();
