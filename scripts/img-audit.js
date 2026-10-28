/* Аудит картинок: progressive JPEG, размеры, потенциально битые файлы */
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

function walk(d, acc = []) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, f.name);
    if (f.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

function isProgressiveJpeg(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return false;
  let i = 2;
  while (i < buf.length - 3) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xc2) return true;              // SOF2 = progressive
    if (m === 0xc0 || m === 0xc1) return false; // baseline
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = (buf[i + 2] << 8) | buf[i + 3];
    i += 2 + len;
  }
  return false;
}

(async () => {
  const files = walk("public/uploads").filter((f) => /\.(jpe?g|png)$/i.test(f));
  let progressive = 0, baseline = 0, other = 0, bad = [];
  let maxW = 0, maxH = 0, sumPixels = 0;
  for (const f of files) {
    let buf;
    try { buf = fs.readFileSync(f); } catch { bad.push(f); continue; }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      if (isProgressiveJpeg(buf)) progressive++; else baseline++;
    } else other++;
    try {
      const m = await sharp(buf).metadata();
      if (m.width) { maxW = Math.max(maxW, m.width); sumPixels += m.width * (m.height || 0); }
      if (m.height) maxH = Math.max(maxH, m.height);
    } catch (e) { bad.push(f + " -> " + e.message); }
  }
  console.log("files:", files.length);
  console.log("progressive:", progressive, "baseline:", baseline, "non-jpeg:", other);
  console.log("max dims:", maxW + "x" + maxH, "avg megapixels:", (sumPixels / files.length / 1e6).toFixed(2));
  console.log("bad files:", bad.length ? bad.join("\n") : "none");
})();
