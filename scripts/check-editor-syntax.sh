#!/usr/bin/env bash
# Проверка синтаксиса всех <script>-блоков product-editor.html через node --check
set -e
cd /home/z/my-project
node -e '
const fs = require("fs");
const html = fs.readFileSync("backend/resources/product-editor.html", "utf8");
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
console.log("script-блоков:", blocks.length);
blocks.forEach((code, i) => {
  try {
    new Function(code); // парсинг без исполнения
    console.log(`блок ${i + 1}: синтаксис OK (${code.length} симв.)`);
  } catch (e) {
    console.error(`блок ${i + 1}: ОШИБКА — ${e.message}`);
    process.exit(1);
  }
});
'
