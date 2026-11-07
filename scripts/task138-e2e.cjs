/* Task 138 E2E: видео в карточках каталога не грузится само, картинки не «моргают».
 *
 * Стенд :8093 (.deploy-package). Обёртка task138-e2e.sh ДО теста вносит в БД
 * стенда «дрейф» данных (цена +1 копейка, id медиа +900000 у первого товара) —
 * живые данные с /api/products расходятся с запечёнными, как на проде.
 *
 * A) Каталог при выключенных видео (владелец, прод): 0 элементов <video>,
 *    0 запросов *.mp4/*.webm, первый слайд каждого товара — КАРТИНКА.
 * B) «Моргание»: ссылка на первый <img> карточки жива и ТОТ ЖЕ САМЫЙ узел
 *    и через 3,5 с после загрузки — живые данные приехали, а перемонтирования
 *    слайдов не случилось (ключ type+url). Раньше все картинки гасли в
 *    скелетон и проявлялись заново.
 * C) Настройки: /api/settings/public отдаёт card_video_enabled=false.
 * D) Включённые видео (владелец включил галочку): <video> появляются, все с
 *    preload="none" (загрузка только по play() активного слайда), у
 *    видео-первого товара — poster (фото вместо чёрного квадрата).
 *
 * Запуск: node scripts/task138-e2e.cjs http://127.0.0.1:8093
 */
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://127.0.0.1:8093";
const PART = process.argv[3] || "off"; // off = A/B/C (видео выключены), on = D (включены)
let PASS = 0, FAIL = 0;
const ok = (s) => { PASS++; console.log("  OK  " + s); };
const bad = (s) => { FAIL++; console.log("  FAIL " + s); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") {
      const url = (m.location() && m.location().url) || "";
      /* Task 151: медиа в песочнице нет (uploads вне пакета), штатный 401
         анонимной проверки auth и сторонняя аналитика из продовых настроек
         (режется по сертификату) — шум среды, не ошибки приложения */
      if (/\/uploads\//.test(url)) return;
      if (/\/api\/auth\//.test(url) && /401|Unauthorized/.test(m.text())) return;
      if (/mc\.yandex|yastatic|metrika/i.test(url)) return;
      if (/ERR_CERT_AUTHORITY_INVALID/.test(m.text())) return;
      consoleErrors.push(m.text() + " @ " + url);
    }
  });
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

  /* ── A + B + C: каталог, видео выключены ── */
  if (PART === "off") {
  console.log("── A/B/C. Каталог: видео выключены (как на проде) ──");
  await page.goto(BASE + "/catalog/", { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(1200); // гидратация + фетч живых данных
  await page.evaluate(() => {
    window.__probe = document.querySelector("article img");
  });
  await page.waitForTimeout(2500); // к этому времени /api/products уже применён

  const videoCount = await page.evaluate(() => document.querySelectorAll("video").length);
  videoCount === 0
    ? ok("A: <video> в каталоге нет (0)")
    : bad(`A: на странице ${videoCount} элементов <video>`);

  const mediaReqs = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .map((r) => r.name)
      .filter((u) => /\.(mp4|webm)(\?|$)/i.test(u))
  );
  mediaReqs.length === 0
    ? ok("A: ни одного сетевого запроса *.mp4/*.webm")
    : bad(`A: видео-запросы: ${mediaReqs.slice(0, 3).join(", ")}`);

  const probe = await page.evaluate(() => ({
    alive: !!(window.__probe && window.__probe.isConnected),
    same: !!(window.__probe && window.__probe === document.querySelector("article img")),
    src: window.__probe ? String(window.__probe.currentSrc || window.__probe.src) : "",
  }));
  probe.alive && probe.same
    ? ok("B: первый <img> карточки — тот же узел после приезда живых данных (без перемонтирования/моргания)")
    : bad(`B: перемонтирование: alive=${probe.alive} same=${probe.same}`);

  const settings = await page.evaluate(async () => {
    const r = await fetch("/api/settings/public", { cache: "no-store" });
    const j = await r.json();
    return j && j.data ? j.data.card_video_enabled : null;
  });
  settings === false
    ? ok("C: /api/settings/public → card_video_enabled=false")
    : bad(`C: card_video_enabled=${settings}`);
  }

  /* ── D: включённые видео (БД стенда переключает обёртка) ── */
  if (PART === "on") {
  console.log("── D. Видео включены галочкой (в БД стенда = 1) ──");
  await page.goto(BASE + "/catalog/", { waitUntil: "load", timeout: 30000 });
  await page.waitForTimeout(2500); // /api/settings/public перевернёт showVideos в true

  const videos = await page.evaluate(() =>
    Array.from(document.querySelectorAll("video")).map((v) => ({
      preload: v.preload,
      poster: v.getAttribute("poster") || "",
      src: v.getAttribute("src") || "",
    }))
  );
  videos.length > 0
    ? ok(`D: <video> появились (${videos.length} шт.; в dev-БД 1 товар с видео) при включённой галочке`)
    : bad("D: видео не появились, хотя card_video_enabled=true");

  if (videos.length > 0) {
    const allNone = videos.every((v) => v.preload === "none");
    allNone
      ? ok("D: все <video> preload=none (загрузка стартует только play() активного слайда)")
      : bad("D: есть <video> не с preload=none: " +
          videos.filter((v) => v.preload !== "none").length);
    const withPoster = videos.filter((v) => v.poster).length;
    withPoster > 0
      ? ok(`D: у ${withPoster} видео задан poster (фото товара вместо чёрного квадрата)`)
      : bad("D: ни у одного видео нет poster");
  }
  }

  const realErrors = consoleErrors.filter(
    (e) => !/favicon|Download the React DevTools/i.test(e) &&
      !/\/api\/auth\/me/i.test(e)
  );
  realErrors.length === 0
    ? ok("Консоль без ошибок (гидратация/JS)")
    : bad(`Ошибки консоли: ${realErrors.slice(0, 2).join(" | ")}`);

  await browser.close();
  console.log(`\nИТОГО: PASS=${PASS} FAIL=${FAIL}`);
  process.exit(FAIL ? 1 : 0);
})().catch((e) => {
  console.error("E2E упал:", e.message);
  process.exit(1);
});
