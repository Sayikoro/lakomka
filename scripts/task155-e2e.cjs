/* Task 155 e2e: computed cursor на живом стенде.
 * Проверяем СТИЛЬ, который реально применил браузер (не исходник CSS):
 *   главная: body/заголовок/абзац → default (не I-beam), ссылка/кнопка → pointer;
 *   карточка товара: поле количества (QtyInput) → text, h1 → default.
 * Запуск: node scripts/task155-e2e.cjs http://127.0.0.1:8096
 */
const { chromium } = require("playwright");
const BASE = process.argv[2] || "http://127.0.0.1:8096";

let fails = 0;
const check = (name, got, want) => {
  if (got === want) console.log(`  OK  ${name}: ${got}`);
  else { fails++; console.log(`  FAIL ${name}: ${JSON.stringify(got)} (ожидалось «${want}»)`); }
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();

  // ── Главная: текстовые элементы и кликабельные ──
  await p.goto(BASE + "/", { waitUntil: "load", timeout: 30000 });
  await p.waitForTimeout(1500);
  const home = await p.evaluate(() => {
    const cs = (el) => (el ? getComputedStyle(el).cursor : null);
    return {
      body: cs(document.body),
      heading: cs(document.querySelector("h1, h2")),
      paragraph: cs(document.querySelector("p")),
      link: cs(document.querySelector("a[href]")),
      button: cs(document.querySelector("button:not(:disabled)")),
    };
  });
  check("body", home.body, "default");
  check("заголовок (h1/h2)", home.heading, "default");
  check("абзац (p)", home.paragraph, "default");
  check("ссылка (a)", home.link, "pointer");
  check("кнопка (button)", home.button, "pointer");

  // ── Карточка товара: реальное поле ввода количества ──
  const slug = await p.evaluate(async () => {
    const r = await fetch("/api/products", { cache: "no-store" });
    const j = await r.json();
    return (j.data ?? []).find((x) => x.show_in_catalog === 1)?.slug ?? "";
  });
  if (!slug) { console.log("  FAIL нет товара с show_in_catalog=1 в /api/products"); process.exit(1); }
  await p.goto(`${BASE}/product/${slug}/`, { waitUntil: "load", timeout: 30000 });
  await p.waitForTimeout(1500);
  const prod = await p.evaluate(() => {
    const cs = (el) => (el ? getComputedStyle(el).cursor : null);
    return {
      qtyInput: cs(document.querySelector('input[aria-label="Количество"]')),
      heading: cs(document.querySelector("h1")),
    };
  });
  check("поле количества (input)", prod.qtyInput, "text");
  check("h1 карточки (текст, не поле)", prod.heading, "default");

  await browser.close();
  if (fails) { console.log(`ПРОВАЛЕНО проверок: ${fails}`); process.exit(1); }
  console.log("Все cursor-проверки зелёные");
  process.exit(0);
})();
