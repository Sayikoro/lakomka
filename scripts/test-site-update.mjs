#!/usr/bin/env node
/**
 * Task «Обновление сайта»: e2e-тесты API /api/admin/site-update*.
 *
 *   BASE_URL=http://127.0.0.1:8000 \
 *   ADMIN_TOKEN=... EDITOR_TOKEN=... \
 *   SITE_ZIP=download/lakomka-update-XXX.zip \
 *   EVIL_ZIP=.update-staging/evil.zip RANDOM_ZIP=.update-staging/random.zip \
 *   node scripts/test-site-update.mjs
 *
 * Проверяет: 401 без токена, 403 не-админу, успешное применение
 * (чанк-загрузка + apply), отказ zip-slip (422), отказ не-архива сайта (422),
 * отказ отсутствующего файла (422), статус (GET) после применения.
 */
const BASE = process.env.BASE_URL ?? "http://127.0.0.1:8000";
const ADMIN = process.env.ADMIN_TOKEN ?? "";
const EDITOR = process.env.EDITOR_TOKEN ?? "";
const SITE_ZIP = process.env.SITE_ZIP ?? "";
const EVIL_ZIP = process.env.EVIL_ZIP ?? "";
const RANDOM_ZIP = process.env.RANDOM_ZIP ?? "";

const CHUNK = 512 * 1024;
let failures = 0;

function check(name, cond, extra = "") {
  const ok = cond ? "PASS" : "FAIL";
  console.log(`[${ok}] ${name}${extra ? " — " + extra : ""}`);
  if (!cond) failures++;
}

async function api(path, { method = "GET", token, body, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body && !(body instanceof FormData)) h["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, {
    method,
    headers: h,
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

async function uploadZip(filePath) {
  const fs = await import("node:fs");
  const file = fs.readFileSync(filePath);
  const total = Math.ceil(file.length / CHUNK);
  const uploadId = "up-test-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  let last = null;
  for (let i = 0; i < total; i++) {
    const chunk = file.subarray(i * CHUNK, Math.min((i + 1) * CHUNK, file.length));
    last = await api("/api/admin/upload/chunk", {
      method: "POST",
      token: ADMIN,
      body: {
        upload_id: uploadId,
        chunk_index: i,
        total_chunks: total,
        filename: filePath.split("/").pop(),
        chunk_base64: chunk.toString("base64"),
      },
    });
    if (last.status !== 200) throw new Error(`chunk ${i}: ${last.status} ${JSON.stringify(last.json)}`);
  }
  if (!last?.json?.data?.done) throw new Error("upload did not finish");
  return { fileName: last.json.data.file_name, size: last.json.data.size, chunks: total };
}

async function main() {
  /* A: без токена — 401 */
  const a = await api("/api/admin/site-update");
  check("A: GET status без токена → 401", a.status === 401, `got ${a.status}`);

  /* B: editor не может применять обновление — 403 */
  const b = await api("/api/admin/site-update/apply", {
    method: "POST", token: EDITOR, body: { file_name: "up-nonexistent.zip" },
  });
  check("B: apply под editor → 403", b.status === 403, `got ${b.status}`);

  /* C: полный цикл — чанк-загрузка + apply */
  const up = await uploadZip(SITE_ZIP);
  check("C1: чанк-загрузка архива", up.size > 1000, `${up.chunks} чанков, ${up.size} байт`);
  const c = await api("/api/admin/site-update/apply", {
    method: "POST", token: ADMIN, body: { file_name: up.fileName },
  });
  check("C2: apply архива сайта → 200", c.status === 200 && c.json?.data?.ok === true,
    `got ${c.status} ${JSON.stringify(c.json).slice(0, 300)}`);
  if (c.json?.data) {
    const d = c.json.data;
    check("C3: файлы применены", d.files > 100, `files=${d.files}`);
    check("C4: медиа в архиве не было и не удалено", d.skipped_media === 0, `skipped_media=${d.skipped_media}`);
    check("C5: версия из манифеста", typeof d.version === "string" && d.version.length > 0, `version=${d.version}`);
  }

  /* D: zip-slip — 422, ничего не применено */
  const dUp = await uploadZip(EVIL_ZIP);
  const d = await api("/api/admin/site-update/apply", {
    method: "POST", token: ADMIN, body: { file_name: dUp.fileName },
  });
  check("D: zip-slip архив → 422", d.status === 422,
    `got ${d.status} ${JSON.stringify(d.json).slice(0, 160)}`);

  /* E: не-архив сайта — 422 */
  const eUp = await uploadZip(RANDOM_ZIP);
  const e = await api("/api/admin/site-update/apply", {
    method: "POST", token: ADMIN, body: { file_name: eUp.fileName },
  });
  check("E: случайный zip → 422 (не архив сайта)", e.status === 422,
    `got ${d.status === 422 ? "" : ""}${JSON.stringify(e.json).slice(0, 160)}`);

  /* F: несуществующий файл — 422 */
  const f = await api("/api/admin/site-update/apply", {
    method: "POST", token: ADMIN, body: { file_name: "up-no-such-file.zip" },
  });
  check("F: несуществующий архив → 422", f.status === 422, `got ${f.status}`);

  /* G: статус после применения */
  const g = await api("/api/admin/site-update", { token: ADMIN });
  check("G1: GET status под админом → 200", g.status === 200, `got ${g.status}`);
  const gd = g.json?.data ?? {};
  check("G2: mode определён", ["deployed", "staging"].includes(gd.mode), `mode=${gd.mode}`);
  check("G3: last_update записан", gd.last_update?.applied_at != null,
    `applied_at=${gd.last_update?.applied_at} files=${gd.last_update?.files}`);
  check("G4: версия пакета", gd.version?.version != null, `version=${gd.version?.version}`);

  console.log(failures === 0 ? "\nALL TESTS PASSED" : `\nFAILURES: ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
