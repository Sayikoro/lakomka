/* Task 152: скриншоты для визуальной проверки. */
const { chromium } = require("playwright");
const BASE = process.argv[2] || "http://127.0.0.1:8096";
const ADMIN = { email: "t152e-admin@lakomka.local", password: "T152e-Admin-2026!" };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  try {
    await page.goto(BASE + "/", { waitUntil: "load" });
    await page.evaluate(async (c) => {
      await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(c) });
    }, ADMIN);

    await page.goto(BASE + "/admin/orders", { waitUntil: "load" });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: "/tmp/render/shots/01-orders.png", fullPage: false });

    await page.goto(BASE + "/admin", { waitUntil: "load" });
    await page.waitForTimeout(2200);
    await page.screenshot({ path: "/tmp/render/shots/02-dashboard.png", fullPage: false });

    await page.goto(BASE + "/admin/analytics", { waitUntil: "load" });
    await page.waitForTimeout(2200);
    const d = new Date();
    await page.fill('[data-testid="analytics-from"]', new Date(d.getTime() - 6 * 864e5).toISOString().slice(0, 10));
    await page.fill('[data-testid="analytics-to"]', d.toISOString().slice(0, 10));
    await page.waitForTimeout(1800);
    await page.screenshot({ path: "/tmp/render/shots/03-analytics.png", fullPage: false });

    await page.goto(BASE + "/admin/orders", { waitUntil: "load" });
    await page.waitForTimeout(1500);
    await page.click('table tbody tr:first-child a >> nth=0');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: "/tmp/render/shots/04-order-view-screen.png", fullPage: false });
    await page.emulateMedia({ media: "print" });
    await page.screenshot({ path: "/tmp/render/shots/05-order-view-print.png", fullPage: false });
    await page.emulateMedia({ media: "screen" });

    await page.goto(BASE + "/admin/products/new", { waitUntil: "load" });
    await page.waitForTimeout(1500);
    const seo = await page.evaluate(() => {
      const els = [...document.querySelectorAll("p, div, label")];
      const el = els.find((e) => (e.textContent || "").includes("SEO — для поисковиков"));
      if (el) el.scrollIntoView({ block: "center" });
      return !!el;
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: "/tmp/render/shots/06-product-form.png", fullPage: false });

    await page.goto(BASE + "/product/mechta-5144/", { waitUntil: "load" });
    await page.waitForTimeout(2000);
    await page.click('button:has-text("Состав подарка")');
    await page.waitForTimeout(600);
    const tabs = await page.evaluate(() => {
      const el = [...document.querySelectorAll("p, h2, div")].find((e) => (e.textContent || "").trim() === "Состав подарка");
      if (el) el.scrollIntoView({ block: "center" });
      return !!el;
    });
    await page.waitForTimeout(400);
    await page.screenshot({ path: "/tmp/render/shots/07-composition-collapsed.png", fullPage: false });
    await page.click('[data-testid="composition-show-all"]');
    await page.waitForTimeout(600);
    await page.screenshot({ path: "/tmp/render/shots/08-composition-expanded.png", fullPage: false });
    console.log("SHOTS DONE seo=" + seo + " tabs=" + tabs);
  } finally {
    await browser.close().catch(() => {});
  }
})().catch((e) => { console.error("CRASH", e.message); process.exit(1); });
