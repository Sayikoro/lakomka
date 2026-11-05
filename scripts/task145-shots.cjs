/* Task 145: скриншоты блока брендов и плиток условий на стенде. */
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://127.0.0.1:8099";

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(1800);

  /* Проверка: все img брендов и иконок реально загрузились (naturalWidth>0) */
  const stat = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll("img")].filter((i) =>
      /\/uploads\/(brands|icons)\//.test(i.currentSrc || i.src || "")
    );
    return {
      total: imgs.length,
      broken: imgs.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src),
    };
  });
  console.log(`изображений брендов/иконок: ${stat.total}, битых: ${stat.broken.length}`);
  if (stat.broken.length) console.log("битые:", stat.broken.slice(0, 5));

  /* Десктоп: плитки условий */
  const info = page.locator('[data-testid="home-info"]');
  await info.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await info.screenshot({ path: "/tmp/t145-info.png" });

  /* Десктоп: блок брендов */
  /* Десктоп: блок брендов (заголовок «В наших подарках конфеты от фабрик») */
  await page.evaluate(() => {
    const h = [...document.querySelectorAll("h2")].find((x) => /конфеты от фабрик|партн|бренд|производ/i.test(x.textContent || ""));
    const sec = h && h.closest("section");
    if (sec) window.scrollTo(0, sec.getBoundingClientRect().top + window.scrollY - 120);
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "/tmp/t145-brands.png" });

  /* Мобильный 390 */
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(BASE + "/", { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const h = [...document.querySelectorAll("h2")].find((x) => /конфеты от фабрик|партн|бренд|производ/i.test(x.textContent || ""));
    const sec = h && h.closest("section");
    if (sec) window.scrollTo(0, sec.getBoundingClientRect().top + window.scrollY - 80);
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "/tmp/t145-mobile.png" });

  await browser.close();
  console.log("скриншоты: /tmp/t145-info.png, /tmp/t145-brands.png, /tmp/t145-mobile.png");
  process.exit(stat.broken.length ? 1 : 0);
})().catch((e) => {
  console.error("CRASH:", e);
  process.exit(2);
});
