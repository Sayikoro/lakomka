#!/usr/bin/env node
/* Task 67 — тест живучей схемы скачивания против ЖИВОГО сервера.
 *
 * Эмулирует клиентскую логику download-with-progress.ts в Node:
 *   1) probe Range bytes=0-0 → 206;
 *   2) параллельная схема: куски 4МБ × 6 рабочих, но КАЖДОЕ соединение
 *      искусственно обрывается после ~1.5-2.5МБ (имитация шлюза) —
 *      хвост докачивается Range-запросом с места разрыва;
 *   3) однопоточная схема с обрывом на ~5МБ и докачкой;
 *   4) сверка sha256 собранного файла с файлом на диске.
 * Всё через :3000 — реальный путь браузера (Next rewrite → PHP).
 */
const { createHash } = require("crypto");
const { readFileSync } = require("fs");
const path = require("path");

const ROOT = "/home/z/my-project";
const FILE = path.join(ROOT, "public/exports/lakomka-products.zip");
const BASE = "http://127.0.0.1:3000";
const URL_PATH = "/api/admin/products/export-zip-download/lakomka-products.zip";
const WORKERS = 6;
const CHUNK = 4 * 1024 * 1024;
const CUT_MIN = 1.5 * 1024 * 1024;
const CUT_MAX = 2.5 * 1024 * 1024;

const cookie = `admin_token=${process.env.ADMIN_TOKEN}`;
const headers = { Cookie: cookie, "cache-control": "no-store" };

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

/* Читает поток, но после ~cutAfter байт рвёт соединение (reader.cancel) —
 * имитация обрыва со стороны шлюза. clean=false если оборвали мы. */
async function readWithCut(reader, cutAfter, onBytes) {
  const parts = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return { parts, clean: true };
    if (value && value.byteLength > 0) {
      parts.push(Buffer.from(value));
      got += value.byteLength;
      onBytes?.(value.byteLength);
      if (got >= cutAfter) {
        try { await reader.cancel(); } catch {}
        return { parts, clean: false };
      }
    }
  }
}

function cutSize() {
  return Math.floor(CUT_MIN + Math.random() * (CUT_MAX - CUT_MIN));
}

async function main() {
  const disk = readFileSync(FILE);
  const size = disk.length;
  console.log(`файл: ${size} байт, sha256=${sha256(disk).slice(0, 16)}…`);

  // ── 1. probe bytes=0-0 ──
  const probe = await fetch(BASE + URL_PATH, { headers: { ...headers, Range: "bytes=0-0" } });
  const cr = probe.headers.get("content-range") || "";
  console.log(`probe: ${probe.status} content-range=${cr}`);
  if (probe.status !== 206 || cr !== `bytes 0-0/${size}`) throw new Error("probe failed");
  await probe.body.cancel();

  // ── 2. параллельная схема с искусственными обрывами ──
  const chunks = [];
  for (let s = 0; s < size; s += CHUNK) {
    chunks.push({ start: s, end: Math.min(s + CHUNK, size) - 1, bufs: [] });
  }
  let received = 0;
  let resumes = 0;
  let wireBytes = 0; // сколько байт прошло «по проводе» (с учётом повторов)

  const runChunk = async (chunk) => {
    const want = chunk.end - chunk.start + 1;
    let got = 0;
    for (;;) {
      const r = await fetch(BASE + URL_PATH, {
        headers: { ...headers, Range: `bytes=${chunk.start + got}-${chunk.end}` },
      });
      if (r.status !== 206) throw new Error(`chunk ${chunk.start}: статус ${r.status}`);
      const declared = Number(r.headers.get("content-length") || 0);
      const cutAt = Math.min(cutSize(), declared || cutSize());
      const { parts, clean } = await readWithCut(r.body.getReader(), cutAt, (n) => {
        got += n; received += n; wireBytes += n;
      });
      chunk.bufs.push(...parts);
      if (got >= want) return;
      resumes++;
      process.stdout.write(`  обрыв куска@${chunk.start}: ${got}/${want}, докачка #${resumes}\n`);
      if (!clean) wireBytes += 0; // оборванный трафик уже учтён в onBytes
    }
  };

  let qi = 0;
  let firstErr = null;
  await Promise.all(
    Array.from({ length: Math.min(WORKERS, chunks.length) }, async () => {
      for (;;) {
        if (firstErr || qi >= chunks.length) return;
        const chunk = chunks[qi++];
        try {
          await runChunk(chunk);
        } catch (e) {
          firstErr = firstErr || e;
          return;
        }
      }
    }),
  );
  if (firstErr) throw firstErr;

  // непрерывное покрытие [0..size)
  let cursor = 0;
  for (const c of chunks.sort((a, b) => a.start - b.start)) {
    if (c.start !== cursor) throw new Error(`дыра на ${cursor}`);
    cursor = c.end + 1;
  }
  if (cursor !== size) throw new Error(`недобор: ${cursor}/${size}`);

  const assembled = Buffer.concat(chunks.flatMap((c) => c.bufs));
  const okParallel = assembled.length === size && sha256(assembled) === sha256(disk);
  console.log(
    `параллельно: собрано ${assembled.length} байт, докачек ${resumes}, ` +
      `по проводе ${wireBytes} (${((wireBytes / size - 1) * 100).toFixed(1)}% накладных), ` +
      `sha256 ${okParallel ? "СОВПАЛ ✓" : "НЕ СОВПАЛ ✗"}`,
  );
  if (!okParallel) throw new Error("parallel sha mismatch");

  // ── 3. однопоточная схема с обрывом на ~5МБ и докачкой ──
  const single = [];
  let sgot = 0;
  let sresumes = 0;
  for (;;) {
    const r = await fetch(BASE + URL_PATH, {
      headers: sgot > 0 ? { ...headers, Range: `bytes=${sgot}-` } : headers,
    });
    if (r.status !== 200 && r.status !== 206) throw new Error(`single: статус ${r.status}`);
    const cutAt = sresumes === 0 ? 5 * 1024 * 1024 : Infinity; // рвём только первый проход
    const { parts, clean } = await readWithCut(r.body.getReader(), cutAt, (n) => {
      sgot += n;
    });
    single.push(...parts);
    if (sgot >= size) break;
    if (!clean || sgot < size) {
      sresumes++;
      console.log(`  однопоточный обрыв на ${sgot}, докачка bytes=${sgot}- → ${r.status === 206 ? "206" : r.status}`);
      if (sgot < size && r.status !== 206 && sresumes > 3) throw new Error("докачка не работает");
    }
  }
  const sBuf = Buffer.concat(single);
  const okSingle = sBuf.length === size && sha256(sBuf) === sha256(disk);
  console.log(`однопоточно: ${sBuf.length} байт, докачек ${sresumes}, sha256 ${okSingle ? "СОВПАЛ ✓" : "НЕ СОВПАЛ ✗"}`);
  if (!okSingle) throw new Error("single sha mismatch");

  console.log("ВСЕ ТЕСТЫ ЗЕЛЁНЫЕ");
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
