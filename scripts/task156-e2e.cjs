/* Task 156 e2e: computed caret-color на живом стенде.
 * Обычный текст (body/заголовок/абзац) → caret-color transparent
 * (мигающая каретка режима F7 невидима); поле ввода количества → НЕ
 * transparent (каретка в поле видна как обычно).
 * Запуск: node scripts/task156-e2e.cjs http://127.0.0.1:8096
 */
const { chromium } = require("playwright");
const BASE = process.argv[2] || "http://127.0.0.1:8096";

let fails = 0;
const isTransparent = (v) => v === "transparent" || v === "rgba(0, 0, 0, 0)";
const check = (name, cond, got) => {
  if (cond) console.log(`  OK  ${name}: ${got}`);
  else { fails++; console.log(`  FAIL ${name}: ${JSON.stringify(got)}`); }
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();

  await p.goto(BASE + "/", { waitUntil: "load", timeout: 30000 });
  await p.waitForTimeout(1500);
  const home = await p.evaluate(() => {
    const cc = (el) => (el ? getComputedStyle(el).caretColor : null);
    return {
      body: cc(document.body),
      heading: cc(document.querySelector("h1, h2")),
      paragraph: cc(document.querySelector("p")),
      button: cc(document.querySelector("button:not(:disabled)")),
    };
  });
  check("body — каретка прозрачна", isTransparent(home.body), home.body);
  check("заголовок — каретка прозрачна", isTransparent(home.heading), home.heading);
  check("абзац — каретка прозрачна", isTransparent(home.paragraph), home.paragraph);
  check("кнопка — каретка прозрачна", isTransparent(home.button), home.button);

  // Поле ввода: каретка живая (не transparent)
  const slug = await p.evaluate(async () => {
    const r = await fetch("/api/products", { cache: "no-store" });
    const j = await r.json();
    return (j.data ?? []).find((x) => x.show_in_catalog === 1)?.slug ?? "";
  });
  if (!slug) { console.log("  FAIL нет товара с show_in_catalog=1 в /api/products"); process.exit(1); }
  await p.goto(`${BASE}/product/${slug}/`, { waitUntil: "load", timeout: 30000 });
  await p.waitForTimeout(1500);
  const qtyCaret = await p.evaluate(
    () => getComputedStyle(document.querySelector('input[aria-label="Количество"]')).caretColor
  );
  check("поле количества — каретка видна (не transparent)", !isTransparent(qtyCaret), qtyCaret);

  // Заодно курсорные проверки Task 155 не сломаны (быстрый дубль)
  const cursors = await p.evaluate(() => {
    const cs = (el) => (el ? getComputedStyle(el).cursor : null);
    return {
      qtyInput: cs(document.querySelector('input[aria-label="Количество"]')),
      h1: cs(document.querySelector("h1")),
    };
  });
  check("поле количества — cursor text (Task 155 жив)", cursors.qtyInput === "text", cursors.qtyInput);
  check("h1 карточки — cursor default (Task 155 жив)", cursors.h1 === "default", cursors.h1);

  await browser.close();
  if (fails) { console.log(`ПРОВАЛЕНО проверок: ${fails}`); process.exit(1); }
  console.log("Все caret/cursor-проверки зелёные");
  process.exit(0);
})();
