/* Task 139: скриншоты для визуальной проверки */
const { chromium } = require("playwright");
const BASE = "http://127.0.0.1:8094";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();

  // 1. Карточка товара: похожие подарки
  await page.goto(BASE + "/", { waitUntil: "load" });
  const slug = await page.evaluate(async () => {
    const j = await (await fetch("/api/products", { cache: "no-store" })).json();
    return j.data[0].slug;
  });
  await page.goto(`${BASE}/product/${slug}/`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/tmp/render/t139-product.png", fullPage: false });
  const similarBox = await page.locator('[data-testid="product-similar"]').boundingBox();
  if (similarBox) {
    await page.evaluate((y) => window.scrollTo(0, y), similarBox.y - 80);
    await page.waitForTimeout(400);
    await page.screenshot({ path: "/tmp/render/t139-product-similar.png", fullPage: false });
  }

  // 2. Каталог десктоп: недавно смотрели в сайдбаре (после двух просмотров)
  const slug2 = await page.evaluate(async () => {
    const j = await (await fetch("/api/products", { cache: "no-store" })).json();
    return j.data.find((p) => p.slug !== location.pathname.split("/")[2]).slug;
  });
  await page.goto(`${BASE}/product/${slug2}/`, { waitUntil: "load" });
  await page.waitForTimeout(800);
  await page.goto(BASE + "/catalog/", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/tmp/render/t139-catalog-desktop.png", fullPage: false });

  // 3. Телефон 390: тот же каталог, блок внизу
  const mob = await ctx.newPage();
  await mob.setViewportSize({ width: 390, height: 844 });
  await mob.goto(BASE + "/catalog/", { waitUntil: "load" });
  await mob.waitForTimeout(1500);
  await mob.screenshot({ path: "/tmp/render/t139-catalog-mobile-top.png" });
  const bottomBox = await mob.locator('[data-testid="recently-viewed-bottom"]').boundingBox().catch(() => null);
  if (bottomBox) {
    await mob.evaluate((y) => window.scrollTo(0, y - 300), bottomBox.y);
    await mob.waitForTimeout(400);
    await mob.screenshot({ path: "/tmp/render/t139-catalog-mobile-bottom.png" });
  }

  // 4. Админка: аналитика с колонкой «Конверсия»
  const adm = await ctx.newPage();
  await adm.goto(BASE + "/admin/login", { waitUntil: "load" });
  await adm.evaluate(async () => {
    await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@lakomka.local", password: "Lakomka2026!" }),
    });
  });
  await adm.goto(BASE + "/admin/analytics", { waitUntil: "load" });
  await adm.waitForTimeout(2500);
  const giftsBox = await adm.locator('[data-testid="analytics-gifts"]').boundingBox().catch(() => null);
  if (giftsBox) {
    await adm.evaluate((y) => window.scrollTo(0, y - 120), giftsBox.y);
    await adm.waitForTimeout(300);
  }
  await adm.screenshot({ path: "/tmp/render/t139-admin-analytics.png" });

  await browser.close();
  console.log("done, slug=" + slug);
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
