/* Тест загрузки медиа в файловое хранилище (AdminFilesController::upload).
 * Проверки:
 *   1. Обычная загрузка PNG в media/upload-test → 200, файл на диске, url доступен.
 *   2. Дедупликация: тот же файл ещё раз → name-1.png.
 *   3. Запрещённое расширение (.php) → 422.
 *   4. MIME-подмена (текст с именем .png) → 422.
 *   5. Несуществующий file_path → 422.
 *   6. target=../traversal → 400/404.
 *   7. Без токена → 401.
 *   8. Загрузка в несуществующую папку → 404.
 *   9. Крупный файл чанками (2 МБ случайных, ext .mp4 подсунуть нельзя → проверяем .pdf mime-подменой отдельно) — пропускаем, чанки уже покрыты тестом site-update.
 */
const API = "http://127.0.0.1:8000/api";
const TOKEN = process.env.ADMIN_TOKEN;

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
}

async function api(method, path, body, withToken = true) {
  const res = await fetch(API + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(withToken ? { Cookie: `admin_token=${TOKEN}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

/* Клиент чанк-загрузки (как chunked-upload.ts) */
async function chunkUpload(bytes, filename) {
  const CHUNK = 512 * 1024;
  const total = Math.max(1, Math.ceil(bytes.length / CHUNK));
  const uploadId = "up-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  for (let i = 0; i < total; i++) {
    const chunk = bytes.subarray(i * CHUNK, Math.min((i + 1) * CHUNK, bytes.length));
    const { status, json } = await api("POST", "/admin/upload/chunk", {
      upload_id: uploadId, chunk_index: i, total_chunks: total,
      filename, chunk_base64: chunk.toString("base64"),
    });
    if (status !== 200) throw new Error(`chunk ${i}: ${status} ${JSON.stringify(json)}`);
    if (json.data?.done) return json.data.file_name;
  }
  throw new Error("upload not done");
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

console.log("== Тест загрузки в файловое хранилище ==");

/* Тестовая папка существует заранее (загрузка идёт в СУЩЕСТВУЮЩУЮ папку) */
const fs = await import("fs");
fs.rmSync("public/uploads/upload-test", { recursive: true, force: true });
fs.mkdirSync("public/uploads/upload-test", { recursive: true });

/* 1. Обычная загрузка */
{
  const fp = await chunkUpload(PNG, "тест файл.png");
  const r = await api("POST", "/admin/files/upload", {
    file_path: fp, original_name: "тест файл.png", target: "media/upload-test",
  });
  check("1: загрузка 200", r.status === 200, JSON.stringify(r.json));
  check("1: имя сохранено", r.json?.data?.name === "тест файл.png", r.json?.data?.name);
  check("1: url /uploads/...", r.json?.data?.url?.startsWith("/uploads/upload-test/"), r.json?.data?.url);
  const onDisk = fs.existsSync("public/uploads/upload-test/" + r.json?.data?.name);
  check("1: файл на диске", onDisk);
  const pub = await fetch("http://127.0.0.1:3000" + r.json?.data?.url);
  check("1: файл отдаётся витриной", pub.status === 200);
}

/* 2. Дедупликация */
{
  const fp = await chunkUpload(PNG, "тест файл.png");
  const r = await api("POST", "/admin/files/upload", {
    file_path: fp, original_name: "тест файл.png", target: "media/upload-test",
  });
  check("2: дедуп → -1.png", r.json?.data?.name === "тест файл-1.png", r.json?.data?.name);
}

/* 3. Запрещённое расширение */
{
  const fp = await chunkUpload(PNG, "shell.php");
  const r = await api("POST", "/admin/files/upload", {
    file_path: fp, original_name: "shell.php", target: "media/upload-test",
  });
  check("3: .php → 422", r.status === 422, String(r.status));
}

/* 4. MIME-подмена: текст с именем .png */
{
  const fp = await chunkUpload(Buffer.from("это не картинка, а текст"), "fake.png");
  const r = await api("POST", "/admin/files/upload", {
    file_path: fp, original_name: "fake.png", target: "media/upload-test",
  });
  check("4: mime-подмена → 422", r.status === 422, String(r.status));
}

/* 5. Несуществующий file_path */
{
  const r = await api("POST", "/admin/files/upload", {
    file_path: "up-nonexistent.zip", original_name: "x.png", target: "media/upload-test",
  });
  check("5: нет файла → 422", r.status === 422, String(r.status));
}

/* 6. Path traversal в target */
{
  const fp = await chunkUpload(PNG, "ok.png");
  for (const t of ["../backend/src", "media/../../..", "media/../storage"]) {
    const r = await api("POST", "/admin/files/upload", {
      file_path: fp, original_name: "ok.png", target: t,
    });
    check(`6: traversal "${t}" отклонён`, r.status >= 400, String(r.status));
  }
}

/* 7. Без токена */
{
  const r = await api("POST", "/admin/files/upload", {
    file_path: "up-x.zip", original_name: "x.png", target: "media",
  }, false);
  check("7: без токена 401", r.status === 401, String(r.status));
}

/* 8. Несуществующая папка назначения */
{
  const fp = await chunkUpload(PNG, "ok2.png");
  const r = await api("POST", "/admin/files/upload", {
    file_path: fp, original_name: "ok2.png", target: "media/no-such-dir-xyz",
  });
  check("8: нет папки → 404", r.status === 404, String(r.status));
}

/* Уборка тестовой папки: media-раздел защищён от удаления через API (это правильно),
   поэтому убираем напрямую по диску */
{
  fs.rmSync("public/uploads/upload-test", { recursive: true, force: true });
  check("уборка: папка удалена", !fs.existsSync("public/uploads/upload-test"));
}

console.log(`\nИТОГО: ${pass} PASS, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
