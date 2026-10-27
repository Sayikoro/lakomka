/**
 * Генератор описаний подарков «Лакомка».
 * Вход:  scripts/desc-batch.json  [{id, name, slug, img, composition[]}, ...]
 * Выход: scripts/desc-results.jsonl (строка на подарок, resume-режим)
 *        scripts/desc-progress.txt (done/total, для опроса)
 *
 * Запуск: LIMIT=2 node scripts/desc-generate.mjs   (тест на 2 шт.)
 *         node scripts/desc-generate.mjs           (полный прогон)
 * Запускается detached (setsid), умеет докачивать: уже готовые id пропускаются.
 */
import fs from "node:fs";
import path from "node:path";
import ZAI from "z-ai-web-dev-sdk";

const DIR = "/home/z/my-project/scripts";
const BATCH = path.join(DIR, "desc-batch.json");
const RESULTS = path.join(DIR, "desc-results.jsonl");
const PROGRESS = path.join(DIR, "desc-progress.txt");
const STYLE = path.join(DIR, "desc-style-example.txt");

const LIMIT = parseInt(process.env.LIMIT || "0", 10); // 0 = без лимита
const CONCURRENCY = 2;          // низкая — API режет частые запросы (429)
const MIN_GAP_MS = 3000;        // минимум между стартами запросов
const RETRIES = 5;              // попыток на подарок
const BACKOFF_MS = [5000, 10000, 20000, 40000, 60000];

// SDK иногда кидает rejection мимо await — не даём процессу умереть
process.on("unhandledRejection", (e) => console.error("unhandledRejection (глотаем):", String(e)));
process.on("uncaughtException", (e) => console.error("uncaughtException (глотаем):", String(e)));

const batch = JSON.parse(fs.readFileSync(BATCH, "utf8"));
const styleExample = fs.readFileSync(STYLE, "utf8").trim();

// resume: какие id уже готовы
const done = new Set();
if (fs.existsSync(RESULTS)) {
  for (const line of fs.readFileSync(RESULTS, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { done.add(JSON.parse(line).id); } catch {}
  }
}

const SYSTEM = `Ты — копирайтер интернет-магазина сладких подарков «Лакомка» (Хабаровск). По фотографии подарка и списку состава пишешь описание для карточки товара.

Требования:
- Обычный текст ровно 3 абзаца, абзацы разделяй ПУСТОЙ строкой. Без HTML, без markdown (**, ##, списки), без заголовков и подписей.
- Первый абзац: опиши упаковку и оформление, как видно на фотографии (форма, материал, цвет, рисунок, декор, надписи). Не выдумывай деталей, которых не видно.
- Второй абзац: аппетитно расскажи, что внутри, строго по приложенному списку состава — не добавляй угощений, которых нет в списке. Перечисляй не всё подряд, а сгруппируй и назови самое интересное.
- Третий абзац: кому и по какому поводу (дети, коллеги, учителя, Новый год, день рождения, благодарность, уют к чаю) и тёплое завершение. Не повторяй формулировки первых двух абзацев.
- Общий объём 550–850 знаков. Тёплый живой тон, обращение к покупателю на «вы». Без канцелярита и штампов вроде «уникальный», «идеальный», «незабываемый».
- Не начинай текст с названия подарка и вообще не вставляй название в текст. Не пиши слово «Описание».
- В ответе — только текст описания, ничего больше.

Пример хорошего стиля (другой подарок):
"""${styleExample}"""`;

const USER = (g) => {
  const comp = g.composition.length
    ? "Состав подарка: " + g.composition.join("; ") + "."
    : "Состав не указан — содержимое опиши обобщённо (ассортимент сладостей), без конкретных наименований.";
  return `Подарок: «${g.name}». ${comp} Фотография подарка приложена. Напиши описание.`;
};

const clean = (s) =>
  (s || "")
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/\*\*|##/g, "")
    .replace(/^\s*описание\s*(подарка)?\s*:?\s*/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

let lastStart = 0;
async function rateSlot() {
  // глобальная очередь: между стартами запросов не меньше MIN_GAP_MS
  for (;;) {
    const now = Date.now();
    const wait = lastStart + MIN_GAP_MS - now;
    if (wait <= 0) { lastStart = now; return; }
    await new Promise((r) => setTimeout(r, wait));
  }
}

async function generateOne(zai, g) {
  let lastErr;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      await rateSlot();
      const r = await zai.chat.completions.createVision({
        model: "glm-4.6v",
        messages: [
          { role: "assistant", content: [{ type: "text", text: SYSTEM }] },
          {
            role: "user",
            content: [
              { type: "text", text: USER(g) },
              { type: "image_url", image_url: { url: g.img } },
            ],
          },
        ],
        thinking: { type: "disabled" },
      });
      const text = clean(r.choices?.[0]?.message?.content);
      if (text.length < 200) throw new Error("короткий ответ (" + text.length + " зн.)");
      return text;
    } catch (e) {
      lastErr = e?.message || String(e);
      const pause = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)];
      console.error(`#${g.id} попытка ${attempt}/${RETRIES} не удалась: ${lastErr} — пауза ${pause / 1000}с`);
      if (attempt < RETRIES) await new Promise((r) => setTimeout(r, pause));
    }
  }
  throw new Error(lastErr);
}

async function main() {
  const zai = await ZAI.create();
  const todo = batch.filter((g) => !done.has(g.id)).slice(0, LIMIT || undefined);
  const total = todo.length;
  console.log(`К работе: ${total} (пропущено готовых: ${done.size})`);
  fs.writeFileSync(PROGRESS, `0/${total} ok:0 err:0\n`);

  let ok = 0, err = 0, processed = 0;
  const queue = [...todo];

  async function worker() {
    while (queue.length) {
      const g = queue.shift();
      if (!g) break;
      try {
        const text = await generateOne(zai, g);
        fs.appendFileSync(RESULTS, JSON.stringify({ id: g.id, slug: g.slug, name: g.name, description: text, ok: true }) + "\n");
        ok++;
      } catch (e) {
        fs.appendFileSync(RESULTS, JSON.stringify({ id: g.id, slug: g.slug, name: g.name, ok: false, error: String(e?.message || e) }) + "\n");
        err++;
        console.error(`ERR #${g.id} ${g.name}: ${e?.message || e}`);
      }
      processed++;
      fs.writeFileSync(PROGRESS, `${processed}/${total} ok:${ok} err:${err} queue:${queue.length}\n`);
      if (processed % 20 === 0) console.log(`... ${processed}/${total} (ok:${ok} err:${err})`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
  console.log(`ГОТОВО: обработано ${processed}, успешно ${ok}, с ошибками ${err}`);
  fs.writeFileSync(PROGRESS, `DONE ${processed}/${total} ok:${ok} err:${err}\n`);
}

main().catch((e) => {
  console.error("FATAL:", e?.message || e);
  process.exit(1);
});
