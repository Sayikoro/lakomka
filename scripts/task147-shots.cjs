/* Task 147 скриншоты: десктоп 1280 и мобильный 390.
 * /tmp/t147-corporate.png — лендинг B2B целиком;
 * /tmp/t147-detskie.png — лендинг детских (шапка + каталог);
 * /tmp/t147-delivery.png — доставка и оплата;
 * /tmp/t147-home-seo.png — низ главной (SEO-блок + футер);
 * /tmp/t147-mobile.png — /corporate на телефоне.
 */
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://127.0.0.1:8098";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();

  await page.goto(BASE + "/corporate/", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/tmp/t147-corporate.png", fullPage: true });

  await page.goto(BASE + "/detskie/", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "/tmp/t147-detskie.png", fullPage: false });

  await page.goto(BASE + "/delivery/", { waitUntil: "load" });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "/tmp/t147-delivery.png", fullPage: true });

  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(2000);
  await page.locator('[data-testid="home-seo"]').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, 200));
  await page.waitForTimeout(600);
  await page.screenshot({ path: "/tmp/t147-home-seo.png", fullPage: false });

  await browser.close();
  console.log("done");
})().catch((e) => { console.error(e.message); process.exit(1); });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/corporate/", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/tmp/t147-mobile.png", fullPage: true });
  await browser.close();
})();
