/* Task 140: скриншоты для визуальной проверки — круглая кнопка
 * с иконкой корзины на карточках «Похожих подарков» + реакция на клик. */
const { chromium } = require("playwright");
const BASE = "http://127.0.0.1:8095";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();

  await page.goto(BASE + "/", { waitUntil: "load" });
  const slug = await page.evaluate(async () => {
    const j = await (await fetch("/api/products", { cache: "no-store" })).json();
    return j.data[0].slug;
  });
  await page.goto(`${BASE}/product/${slug}/`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const similarBox = await page.locator('[data-testid="product-similar"]').boundingBox();
  if (similarBox) {
    await page.evaluate((y) => window.scrollTo(0, y - 60), similarBox.y);
    await page.waitForTimeout(400);
    await page.screenshot({ path: "/tmp/render/t140-similar-desktop.png", fullPage: false });
  }

  // Клик по первой круглой кнопке — зелёная галочка + бейдж «1»
  await page.click('[data-testid="product-similar"] button[aria-label^="Добавить"] >> nth=0');
  await page.waitForTimeout(350);
  await page.screenshot({ path: "/tmp/render/t140-added-desktop.png", fullPage: false });

  // Телефон 390: тот же блок
  const mob = await ctx.newPage();
  await mob.setViewportSize({ width: 390, height: 844 });
  await mob.goto(`${BASE}/product/${slug}/`, { waitUntil: "load" });
  await mob.waitForTimeout(1500);
  const mb = await mob.locator('[data-testid="product-similar"]').boundingBox().catch(() => null);
  if (mb) {
    await mob.evaluate((y) => window.scrollTo(0, y - 40), mb.y);
    await mob.waitForTimeout(400);
    await mob.screenshot({ path: "/tmp/render/t140-similar-mobile.png", fullPage: false });
  }

  await browser.close();
  console.log("done, slug=" + slug);
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
