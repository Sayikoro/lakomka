#!/usr/bin/env node
/* Task 151 E2E: вычисленные стили на стенде .deploy-package.
   КЛЮЧЕВАЯ проверка — H1 Hero «новогодняя» реально БЕЛЫЙ (rgb(255,255,255)):
   до фикса unlayered-правило h1..h6 перебивало .text-white и заголовок
   «новогодняя коллекция 2027» был серым/разноцветным. Плюс: гирлянда —
   классическая пятёрка цветов, снежинки — фирменный голубой, SEO-блок
   снят с главной, системный эффект фикса — заголовок блока фабрик снова
   приглушённо-серый (--color-muted), как задано его классом. */
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://127.0.0.1:8096";
let PASS = 0, FAIL = 0;
const ok = (m) => { PASS++; console.log("  OK  " + m); };
const bad = (m) => { FAIL++; console.log("  FAIL " + m); };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const url = msg.location()?.url || "";
    /* медиа в песочнице нет (uploads не входит в пакет) — 404 картинок не считаем */
    if (/\/uploads\//.test(url)) return;
    /* анонимная проверка авторизации на витрине — штатные 401 */
    if (/\/api\/auth\//.test(url) && /401|Unauthorized/.test(msg.text())) return;
    if (/favicon|\.webp|\.png|\.jpe?g|\.svg/i.test(url) && /404|Failed/.test(msg.text())) return;
    /* внешний https-ресурс (аналитика из продовых настроек) в песочнице режется
       по сертификату — http-стенду ошибка сертификата не свойственна */
    if (/ERR_CERT_AUTHORITY_INVALID/.test(msg.text())) return;
    consoleErrors.push(`${msg.text()} @ ${url}`);
  });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="newyear-counter"]', { timeout: 15000 });

  /* A. Hero: ровно один H1 и он БЕЛЫЙ (фикс каскада) */
  const hero = await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    const ps = document.querySelectorAll("section[aria-label='Новогодняя коллекция 2027'] p.font-hero, section[aria-label='Новогодняя коллекция 2027'] p.font-display");
    return {
      h1Count: document.querySelectorAll("h1").length,
      h1Text: h1 ? h1.textContent.trim() : "",
      h1Color: h1 ? getComputedStyle(h1).color : "",
      ps: [...ps].map((p) => getComputedStyle(p).color),
    };
  });
  hero.h1Count === 1 ? ok("H1 на главной ровно один") : bad(`H1: ${hero.h1Count}`);
  hero.h1Text.toLowerCase() === "новогодняя"
    ? ok(`H1 — первая строка Hero («${hero.h1Text}»)`)
    : bad(`H1 текст: ${hero.h1Text}`);
  hero.h1Color === "rgb(255, 255, 255)"
    ? ok("H1 «новогодняя» вычисленно БЕЛЫЙ (фикс @layer base работает)")
    : bad(`H1 цвет ${hero.h1Color}, ожидался rgb(255, 255, 255)`);
  const psWhite = hero.ps.length && hero.ps.every((c) => c === "rgb(255, 255, 255)");
  psWhite ? ok(`строки 2–3 заголовка тоже белые (${hero.ps.length} шт.)`)
          : bad(`строки Hero не белые: ${hero.ps.join(", ")}`);

  /* B. Гирлянда: классические цвета, ни одного белого огонька */
  const garland = await page.evaluate(() => {
    const bulbs = [...document.querySelectorAll(".ny-bulb")];
    const colors = bulbs.map((b) => getComputedStyle(b).backgroundColor);
    const flake = document.querySelector(".ny-flake");
    const head = document.querySelector(".ny-head");
    return {
      n: bulbs.length,
      uniq: [...new Set(colors)],
      first: colors[0] || "",
      anyWhite: colors.some((c) => c === "rgb(255, 255, 255)" || c === "#ffffff"),
      flake: flake ? getComputedStyle(flake).color : "",
      head: head ? getComputedStyle(head).color : "",
    };
  });
  garland.n === 12 ? ok("огоньков гирлянды 12") : bad(`огоньков ${garland.n}`);
  garland.first === "rgb(255, 89, 100)"
    ? ok("первый огонёк красный #ff5964 (Task 142 вернулся)")
    : bad(`первый огонёк ${garland.first}`);
  garland.uniq.length >= 4
    ? ok(`палитра радужная: ${garland.uniq.length} разных цветов`)
    : bad(`в палитре всего ${garland.uniq.length} цвет(ов): ${garland.uniq.join(", ")}`);
  !garland.anyWhite
    ? ok("белых огоньков нет (перекраска Task 149 откачена)")
    : bad("среди огоньков есть белый");
  garland.flake.startsWith("rgba(2, 116, 190")
    ? ok("снежинки блока — фирменный голубой rgba(2,116,190,.38)")
    : bad(`снежинка ${garland.flake}`);
  garland.head === "rgb(58, 58, 58)"
    ? ok("надпись блока «До Нового года осталось» — прежний цвет заголовков")
    : bad(`цвет надписи ${garland.head}`);

  /* C. Системный эффект фикса слоя: заголовок блока фабрик снова muted */
  const brandsH2 = await page.evaluate(() => {
    const h2 = [...document.querySelectorAll("h2")].find((x) =>
      (x.textContent || "").toLowerCase().includes("фабрик"));
    return h2 ? getComputedStyle(h2).color : "";
  });
  brandsH2 === "rgb(122, 122, 122)"
    ? ok("h2 блока фабрик — var(--color-muted), класс применился (системный фикс)")
    : bad(`h2 фабрик ${brandsH2}, ожидался rgb(122, 122, 122)`);

  /* D. SEO-блок снят */
  const seo = await page.evaluate(() => ({
    block: document.querySelectorAll('[data-testid="home-seo"]').length,
    text: document.body.innerText.includes("Новогодние подарки в Хабаровске от производителя"),
  }));
  seo.block === 0 && !seo.text
    ? ok("SEO-текст «Новогодние подарки в Хабаровске…» снят с главной")
    : bad(`SEO-блок: секций ${seo.block}, текст найден: ${seo.text}`);

  /* E. Консоль чиста (медиа-404 отфильтрованы) */
  consoleErrors.length === 0
    ? ok("консоль браузера чиста (без ошибок JS)")
    : bad("ошибки консоли: " + consoleErrors.slice(0, 3).join(" | "));

  await browser.close();
  console.log(`\nИТОГО: PASS=${PASS} FAIL=${FAIL}`);
  process.exit(FAIL === 0 ? 0 : 1);
})().catch((e) => { console.error("e2e упал:", e.message); process.exit(1); });
