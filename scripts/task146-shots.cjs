/* Task 146 скриншоты: блок фабрик из галереи (десктоп/мобайл) и
 * вкладка «Галерея» в админке. */
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://127.0.0.1:8098";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();

  // 1. Блок фабрик на главной (десктоп)
  await page.goto(BASE + "/", { waitUntil: "load" });
  await page.waitForTimeout(2500);
  const box = await page.locator('[data-testid="brand-logos"]').boundingBox().catch(() => null);
  if (box) {
    await page.evaluate((y) => window.scrollTo(0, y - 150), box.y);
    await page.waitForTimeout(600);
  }
  await page.screenshot({ path: "/tmp/t146-home-brands.png" });

  // 2. Админка: вкладка «Галерея»
  await page.evaluate(async () => {
    await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@lakomka.local", password: "Lakomka2026!" }),
    });
  });
  await page.goto(BASE + "/admin/files", { waitUntil: "load" });
  await page.waitForTimeout(1200);
  await page.click('[data-testid="files-tab-gallery"]');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: "/tmp/t146-admin-gallery.png" });

  // 3. Мобильный вид блока фабрик
  const mob = await ctx.newPage();
  await mob.setViewportSize({ width: 390, height: 844 });
  await mob.goto(BASE + "/", { waitUntil: "load" });
  await mob.waitForTimeout(2200);
  const mbox = await mob.locator('[data-testid="brand-logos"]').boundingBox().catch(() => null);
  if (mbox) {
    await mob.evaluate((y) => window.scrollTo(0, y - 80), mbox.y);
    await mob.waitForTimeout(500);
  }
  await mob.screenshot({ path: "/tmp/t146-mobile.png" });

  await browser.close();
  console.log("shots done");
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
