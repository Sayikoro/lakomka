/* Task 142 скриншоты: хрониометр «До Нового года» — десктоп 1280 и телефон 390 */
const { chromium } = require("playwright");
const BASE = process.argv[2] || "http://127.0.0.1:8097";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(1800);
  await page.evaluate(() =>
    document.querySelector('[data-testid="newyear-counter"]')?.scrollIntoView({ block: "center" })
  );
  await page.waitForTimeout(2200); // дождаться входных анимаций (~1,2 с)
  await page.screenshot({ path: "/tmp/t142-desktop.png" });

  const mob = await browser.newPage({ viewport: { width: 390, height: 744 } });
  await mob.goto(BASE + "/", { waitUntil: "load", timeout: 30000 });
  await mob.waitForTimeout(1800);
  await mob.evaluate(() =>
    document.querySelector('[data-testid="newyear-counter"]')?.scrollIntoView({ block: "center" })
  );
  await mob.waitForTimeout(2200);
  await mob.screenshot({ path: "/tmp/t142-mobile.png" });

  await browser.close();
  console.log("shots done");
})().catch((e) => { console.error(e); process.exit(1); });
