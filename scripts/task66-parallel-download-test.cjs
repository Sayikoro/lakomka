#!/usr/bin/env node
/* Тест параллельной загрузки (Task 66): 6 параллельных Range-потоков к
 * /api/admin/products/export-zip-download — сборка по частям и сверка
 * sha256 с полным файлом. Эмулирует клиентскую схему download-in-parallel-parts. */

const { execSync } = require("child_process");
const fs = require("fs");
const crypto = require("crypto");
const http = require("http");

const FILE = "/home/z/my-project/public/exports/lakomka-products.zip";
const URL_PATH = "/api/admin/products/export-zip-download/lakomka-products.zip";
const PARTS = 6;

const token = execSync(
  `cd /home/z/my-project && .ztools/php -r "require_once 'backend/src/Auth.php'; echo Auth::issueToken(1, 'admin@local.test', 'super_admin');"`,
).toString().trim();

const total = fs.statSync(FILE).size;
const base = Math.floor(total / PARTS);
const ranges = [];
let s = 0;
for (let i = 0; i < PARTS; i++) {
  const e = i === PARTS - 1 ? total - 1 : s + base - 1;
  ranges.push([s, e]);
  s = e + 1;
}
console.log(`файл ${total} байт, ${PARTS} частей:`, ranges.map(r => r.join("-")).join(", "));

const t0 = Date.now();
Promise.all(ranges.map(([start, end], i) => new Promise((resolve, reject) => {
  const req = http.request({
    host: "127.0.0.1", port: 8000, path: URL_PATH, method: "GET",
    headers: { Cookie: `admin_token=${token}`, Range: `bytes=${start}-${end}` },
  }, (res) => {
    if (res.statusCode !== 206) return reject(new Error(`часть ${i+1}: http ${res.statusCode}`));
    const cr = res.headers["content-range"];
    const chunks = [];
    res.on("data", (c) => chunks.push(c));
    res.on("end", () => {
      const buf = Buffer.concat(chunks);
      const expect = end - start + 1;
      if (buf.length !== expect) return reject(new Error(`часть ${i+1}: ${buf.length} != ${expect}`));
      console.log(`часть ${i+1} [${start}-${end}]: 206, ${buf.length} байт, Content-Range: ${cr}`);
      resolve({ start, buf });
    });
  });
  req.on("error", reject);
  req.end();
}))).then((parts) => {
  parts.sort((a, b) => a.start - b.start);
  const assembled = Buffer.concat(parts.map(p => p.buf));
  const h1 = crypto.createHash("sha256").update(assembled).digest("hex");
  const h2 = crypto.createHash("sha256").update(fs.readFileSync(FILE)).digest("hex");
  const dt = ((Date.now() - t0) / 1000).toFixed(2);
  const speed = (total / 1024 / 1024 / (dt || 1)).toFixed(1);
  console.log(`собрано ${assembled.length} байт за ${dt}с (внутр. ${speed} МБ/с)`);
  if (h1 !== h2) { console.error("FAIL: sha256 не совпал!"); process.exit(1); }
  console.log("PASS: sha256 собранного = sha256 файла на диске — параллельная схема корректна");
  process.exit(0);
}).catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
