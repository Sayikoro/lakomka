/* Task 157 e2e: три улучшения админки на живом стенде (:8097).
 * A) Логин админом (сид task153-e2e-seed.php).
 * B) /admin/products: ссылка «сайт» в строке → /product/<slug>/, target=_blank,
 *    страница товара реально отвечает 200.
 * C) Inline-цена: правим значение, коммитим Enter → после перезагрузки
 *    значение сохранилось; возвращаем обратно.
 * D) /admin/settings → вкладка «Здоровье»: карточка БД содержит «Изменена:»
 *    с реальной датой (не «—»).
 * Запуск: node scripts/task157-e2e.cjs http://127.0.0.1:8097
 */
const { chromium } = require("playwright");
const BASE = process.argv[2] || "http://127.0.0.1:8097";
const ADMIN = { email: "t153e-admin@lakomka.local", password: "T153e-Admin-2026!" };

let fails = 0;
const ok = (m) => console.log(`  OK  ${m}`);
const bad = (m) => { fails++; console.log(`  FAIL ${m}`); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();

  // ── A. Логин ──
  await p.goto(BASE + "/admin/login/", { waitUntil: "load", timeout: 30000 });
  const logged = await p.evaluate(async (creds) => {
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(creds),
    });
    return r.ok;
  }, ADMIN);
  logged ? ok("логин супер-админом") : bad("логин не прошёл");

  // ── B. Список товаров: сайт-ссылка ──
  await p.goto(BASE + "/admin/products/", { waitUntil: "load", timeout: 30000 });
  await p.waitForTimeout(2500);
  const links = await p.evaluate(() =>
    Array.from(document.querySelectorAll('a[data-testid^="site-link-"]')).map((a) => ({
      href: a.getAttribute("href"),
      target: a.getAttribute("target"),
      text: a.textContent.trim(),
    }))
  );
  if (!links.length) bad("сайт-ссылка в строке товара не найдена");
  else {
    ok(`сайт-ссылок в таблице: ${links.length}, первая: ${links[0].href} (target=${links[0].target}, текст «${links[0].text}»)`);
    links.every((l) => l.target === "_blank") ? ok("все открываются в новой вкладке") : bad("не все target=_blank");
    /* Сидовые товары созданы ПОСЛЕ сборки — их статических страниц нет (404).
       Ищем запечённый товар с карточкой через API (первые страницы списка)
       и проверяем, что его /product/<slug>/ отвечает 200. */
    let aliveHref = "";
    for (let page = 1; page <= 6 && !aliveHref; page++) {
      const items = await p.evaluate(async (n) => {
        const r = await fetch(`/api/admin/products?page=${n}&per_page=20`, { cache: "no-store" });
        const j = await r.json();
        /* админский list отдаёт плоский {data:[...]}, поиск (q=…) — {data:{data:[…]}} */
        const arr = Array.isArray(j.data) ? j.data : (j.data?.data ?? []);
        return arr
          .filter((x) => x.type !== "recipe" && x.slug)
          .map((x) => `/product/${x.slug}/`);
      }, page);
      for (const href of items) {
        const st = await p.evaluate(async (h) => (await fetch(h)).status, href);
        if (st === 200) { aliveHref = href; break; }
      }
    }
    aliveHref
      ? ok(`карточка товара открывается на сайте: ${aliveHref} → 200`)
      : bad("ни одна карточка товара не отвечает 200");
  }

  // ── C. Inline-цена: Enter-коммит + сохранение ──
  const priceInp = p.locator('input[aria-label="Цена, ₽"]').first();
  await priceInp.scrollIntoViewIfNeeded();
  const before = Number(await priceInp.inputValue());
  const changed = before + 1;
  await priceInp.fill(String(changed));
  await priceInp.press("Enter");
  await p.waitForTimeout(1200);
  await p.reload({ waitUntil: "load", timeout: 30000 });
  await p.waitForTimeout(2500);
  const priceInp2 = p.locator('input[aria-label="Цена, ₽"]').first();
  const after = Number(await priceInp2.inputValue());
  after === changed
    ? ok(`inline-цена: ${before} → ${changed} сохранилась после перезагрузки (Enter-коммит)`)
    : bad(`inline-цена не сохранилась: было ${before}, стало ${after}`);
  // вернуть как было
  await priceInp2.fill(String(before));
  await priceInp2.press("Enter");
  await p.waitForTimeout(1000);
  await p.reload({ waitUntil: "load", timeout: 30000 });
  await p.waitForTimeout(2000);
  const reverted = Number(await p.locator('input[aria-label="Цена, ₽"]').first().inputValue());
  reverted === before ? ok(`цена возвращена к ${before}`) : bad(`откат не удался: ${reverted}`);

  // ── D. Здоровье: возраст БД ──
  await p.goto(BASE + "/admin/settings/", { waitUntil: "load", timeout: 30000 });
  await p.waitForTimeout(1500);
  await p.locator('[data-testid="tab-health"]').click();
  await p.waitForSelector('[data-testid="health-db"]', { timeout: 15000 });
  const dbText = await p.locator('[data-testid="health-db"]').innerText();
  const m = dbText.match(/Изменена:\s*(\S.*)/);
  m && !m[1].startsWith("—")
    ? ok(`Здоровье → БД: «Изменена: ${m[1].trim()}»`)
    : bad(`«Изменена» не показана или пуста: ${JSON.stringify(dbText.slice(0, 120))}`);

  await browser.close();
  if (fails) { console.log(`ПРОВАЛЕНО проверок: ${fails}`); process.exit(1); }
  console.log("Все проверки Task 157 зелёные");
  process.exit(0);
})();
