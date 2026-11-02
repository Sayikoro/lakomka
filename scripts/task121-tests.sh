#!/bin/bash
# Task 121: большой пакет улучшений админки:
#   1) уведомление админу о заказе — тумблер notify_admin_email (Mailer,
#      ключ в настройках, чекбокс в SettingsForm);
#   2) автосохранение черновика формы товара + beforeunload (ProductForm);
#   3) авто-бэкап БД по расписанию (DbMigrations::maybeAutoBackup + Bootstrap);
#   4) «Здоровье сайта» вкладкой в Настройках (Health.php + /admin/health + HealthTab);
#   5) журнал входов /admin/logins + вкладка на странице «Пользователи»;
#   6) серверная пагинация /admin/products (page/per_page/sort/category/цена/вес + фасеты);
#   7) alt = название товара (ProductGallery миниатюры, плитки категорий каталога);
#   8) тёмная тема админки (data-admin-theme + ThemeToggle + --color-card);
#   9) белый фон картинок в составе подарка (ProductTabs ×3).
# Регрессии запускаются отдельно: task118/117/116/115/114/112-tests.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PHP="$(command -v php 2>/dev/null || true)"
[ -z "$PHP" ] && [ -x "$ROOT/.ztools/php" ] && PHP="$ROOT/.ztools/php"
[ -z "$PHP" ] && [ -x "$ROOT/../.ztools/php" ] && PHP="$(readlink -f "$ROOT/../.ztools/php")"
[ -n "$PHP" ] || { echo "php не найден"; exit 1; }
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }
jget(){ python3 -c "
import json,sys
try:
    d=json.loads(sys.argv[1])
    for k in sys.argv[2].split('.'):
        d=d[int(k)] if k.lstrip('-').isdigit() else d[k]
    if isinstance(d,bool): d=str(d).lower()
    print(d)
except Exception:
    print('')" "$1" "$2" 2>/dev/null; }

echo "── 1. Синтаксис, типы, линт ──"
for f in backend/src/Health.php backend/src/DbMigrations.php backend/src/Bootstrap.php \
         backend/src/Mailer.php backend/src/Controllers/AdminSettingsController.php \
         backend/src/Controllers/AdminMaintenanceController.php \
         backend/src/Controllers/AdminProductsController.php backend/public/index.php; do
  $PHP -l "$ROOT/$f" > /dev/null 2>&1 && ok "php -l $f" || bad "php -l $f"
done
if npx tsc --noEmit > /tmp/t121-tsc.log 2>&1; then ok "tsc --noEmit чист"; else bad "tsc: $(head -3 /tmp/t121-tsc.log)"; fi
ESL_FILES="src/components/admin/ProductsTable.tsx src/components/admin/ProductForm.tsx \
src/components/admin/HealthTab.tsx src/components/admin/LoginAttemptsTab.tsx \
src/components/admin/ThemeToggle.tsx src/components/admin/SettingsTabs.tsx \
src/components/admin/SettingsForm.tsx src/app/admin/users/page.tsx \
src/app/admin/settings/page.tsx src/app/admin/layout.tsx src/app/layout.tsx \
src/components/ui/ProductGallery.tsx src/components/ui/ProductTabs.tsx \
src/app/(shop)/catalog/CatalogClient.tsx"
if npx eslint $ESL_FILES > /tmp/t121-eslint.log 2>&1; then ok "eslint 0 ошибок"; else bad "eslint: $(grep -E 'error' /tmp/t121-eslint.log | head -2)"; fi

echo "── 2. Маркеры ──"
# уведомление админу
rg -q "notify_admin_email" "$ROOT/backend/src/Mailer.php" && ok "Mailer: тумблер notify_admin_email" || bad "Mailer без тумблера"
rg -q "'notify_admin_email'" "$ROOT/backend/src/Controllers/AdminSettingsController.php" && ok "настройки: ключ в KEYS" || bad "ключа нет в KEYS"
rg -q "notify_admin_email" "$ROOT/src/components/admin/SettingsForm.tsx" && ok "SettingsForm: чекбокс дублей" || bad "нет чекбокса"
# авто-бэкап
rg -q "maybeAutoBackup" "$ROOT/backend/src/DbMigrations.php" && ok "DbMigrations: maybeAutoBackup()" || bad "нет maybeAutoBackup"
rg -q "DbMigrations::maybeAutoBackup" "$ROOT/backend/src/Bootstrap.php" && ok "Bootstrap: авто-бэкап при старте" || bad "Bootstrap без авто-бэкапа"
rg -q "'backup_interval_days'" "$ROOT/backend/src/Controllers/AdminSettingsController.php" && ok "настройки: backup_interval_days" || bad "нет backup_interval_days"
# health + logins
rg -q "class Health" "$ROOT/backend/src/Health.php" && ok "Health.php: класс есть" || bad "нет Health.php"
rg -q "AdminMaintenanceController::health" "$ROOT/backend/public/index.php" && ok "роут /api/admin/health" || bad "нет роута health"
rg -q "AdminMaintenanceController::logins" "$ROOT/backend/public/index.php" && ok "роут /api/admin/logins" || bad "нет роута logins"
rg -q "requireSuperAdmin" "$ROOT/backend/src/Controllers/AdminMaintenanceController.php" && ok "health/logins: только super_admin" || bad "нет requireSuperAdmin"
rg -q "HealthTab" "$ROOT/src/components/admin/SettingsTabs.tsx" && ok "Настройки: вкладка «Здоровье»" || bad "нет вкладки Здоровье"
rg -q "LoginAttemptsTab" "$ROOT/src/app/admin/users/page.tsx" && ok "Пользователи: вкладка «Входы»" || bad "нет вкладки Входы"
# пагинация товаров
rg -q "categories_present" "$ROOT/backend/src/Controllers/AdminProductsController.php" && ok "API: фасеты categories_present" || bad "нет фасетов"
rg -q "category_thumbs" "$ROOT/backend/src/Controllers/AdminProductsController.php" && ok "API: фасет category_thumbs" || bad "нет category_thumbs"
rg -q 'pageNumbers' "$ROOT/src/components/admin/ProductsTable.tsx" && ok "таблица: пагинация pageNumbers" || bad "нет пагинации"
rg -q 'per_page' "$ROOT/src/components/admin/ProductsTable.tsx" && ok "таблица: per_page уходит в API" || bad "нет per_page"
rg -q 'data-testid="pagination"' "$ROOT/src/components/admin/ProductsTable.tsx" && ok "таблица: панель пагинации" || bad "нет панели пагинации"
# черновик формы
rg -q "lakomka_product_draft_" "$ROOT/src/components/admin/ProductForm.tsx" && ok "форма: ключ черновика" || bad "нет ключа черновика"
rg -q "beforeunload" "$ROOT/src/components/admin/ProductForm.tsx" && ok "форма: защита от ухода" || bad "нет beforeunload"
rg -q 'data-testid="draft-restored"' "$ROOT/src/components/admin/ProductForm.tsx" && ok "форма: плашка восстановления" || bad "нет плашки"
# тёмная тема
rg -q 'data-admin-theme' "$ROOT/src/components/admin/ThemeToggle.tsx" && ok "тема: атрибут data-admin-theme" || bad "нет атрибута темы"
rg -q 'admin_theme' "$ROOT/src/components/admin/ThemeToggle.tsx" && ok "тема: localStorage admin_theme" || bad "нет localStorage"
rg -q "THEME_NOFLASH_SCRIPT" "$ROOT/src/app/layout.tsx" && rg -q "AdminThemeSync" "$ROOT/src/app/layout.tsx" && ok "тема: no-flash + AdminThemeSync в корневом layout" || bad "нет no-flash"
rg -q 'html\[data-admin-theme="dark"\]' "$ROOT/src/app/globals.css" && ok "css: переопределение переменных" || bad "нет css-блока"
rg -q -- '--color-card' "$ROOT/src/app/globals.css" && ok "css: переменная --color-card" || bad "нет --color-card"
NOCARD=$(rg -l 'bg-white' src/components/admin/ src/app/admin/ 2>/dev/null | while read -r f; do rg -q 'bg-white[^/0-9]' "$f" && echo "$f"; done | head -1)
[ -z "$NOCARD" ] && ok "админка: жёстких bg-white не осталось (кроме bg-white/N)" || bad "остался bg-white: $NOCARD"
rg -q 'ThemeToggle' "$ROOT/src/app/admin/layout.tsx" && ok "сайдбар: переключатель темы" || bad "нет ThemeToggle в сайдбаре"
# витрина: фон состава + alt
COMP=$(rg -c 'bg-white' "$ROOT/src/components/ui/ProductTabs.tsx" || echo 0)
[ "${COMP:-0}" -ge 4 ] && ok "состав подарка: белые подложки (4 зоны)" || bad "белых подложек в ProductTabs: $COMP"
rg -q '— фото \$\{i \+ 1\}' "$ROOT/src/components/ui/ProductGallery.tsx" && ok "галерея: alt «Название — фото N»" || bad "нет alt-фолбэка"
rg -q 'alt=\{c\.name\}' "$ROOT/src/app/(shop)/catalog/CatalogClient.tsx" && ok "каталог: alt плитки = категория" || bad "нет alt плиток"

echo "── 3. Юнит: авто-бэкап и тумблер почты ──"
BUPDIR="$ROOT/backend/storage/backups"
mkdir -p "$BUPDIR"
# детерминизм: прячем существующие дампы (у свежеклона mtime = сегодня,
# и авто-бэкап честно считает их «свежими»)
rm -rf /tmp/t121-bup-bak; mkdir -p /tmp/t121-bup-bak
mv "$BUPDIR"/*.sqlite /tmp/t121-bup-bak/ 2>/dev/null || true
$PHP -r '
require $argv[1]."/backend/src/DbMigrations.php";
$pdo = new PDO("sqlite:".$argv[1]."/backend/storage/database.sqlite");
$f = DbMigrations::maybeAutoBackup($pdo, 3);
echo $f !== "" ? "created:".basename($f) : "skip";
' "$ROOT" > /tmp/t121-autobackup.txt 2>/dev/null
cat /tmp/t121-autobackup.txt | grep -q "^created:.*-auto" && ok "maybeAutoBackup: дамп создан (интервал 3 сут., дампов не было)" || bad "авто-бэкап: $(cat /tmp/t121-autobackup.txt)"
AFTER=$(ls "$BUPDIR"/*.sqlite 2>/dev/null | wc -l)
[ "$AFTER" -ge 1 ] && ok "файл дампа появился в storage/backups" || bad "файла нет"
$PHP -r '
require $argv[1]."/backend/src/DbMigrations.php";
$pdo = new PDO("sqlite:".$argv[1]."/backend/storage/database.sqlite");
echo DbMigrations::maybeAutoBackup($pdo, 3) === "" ? "skip-fresh" : "wrong";
' "$ROOT" > /tmp/t121-autobackup2.txt 2>/dev/null
grep -q "skip-fresh" /tmp/t121-autobackup2.txt && ok "maybeAutoBackup: свежий дамп — повтор пропущен" || bad "повтор: $(cat /tmp/t121-autobackup2.txt)"
$PHP -r '
require $argv[1]."/backend/src/DbMigrations.php";
$pdo = new PDO("sqlite:".$argv[1]."/backend/storage/database.sqlite");
echo DbMigrations::maybeAutoBackup($pdo, 0) === "" ? "off" : "wrong";
' "$ROOT" > /tmp/t121-autobackup3.txt 2>/dev/null
grep -q "^off$" /tmp/t121-autobackup3.txt && ok "maybeAutoBackup: интервал 0 = выключено" || bad "интервал 0: $(cat /tmp/t121-autobackup3.txt)"
# чистим: убираем тестовый дамп, возвращаем прежние
rm -f "$BUPDIR"/*-auto*.sqlite 2>/dev/null
mv /tmp/t121-bup-bak/*.sqlite "$BUPDIR"/ 2>/dev/null || true
rmdir /tmp/t121-bup-bak 2>/dev/null || true
# тумблер почты: mail_driver=log — письмо админу пишется в mail.log, выключено — нет
$PHP -r '
$root = $argv[1];
require $root."/backend/config.php";          // ключи шифрования (Database/Crypto)
require $root."/backend/src/Database.php";    // Mailer::__construct читает настройки через Database::get()
$pdo = Database::get();
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$set = $pdo->prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
$old = $pdo->query("SELECT key, value FROM settings WHERE key IN (\"notify_admin_email\",\"admin_email\",\"mail_driver\")")->fetchAll(PDO::FETCH_KEY_PAIR);
file_put_contents("/tmp/t121-mail-old.json", json_encode($old));
$set->execute(["mail_driver", "log"]);
$set->execute(["admin_email", "t121@example.com"]);
$set->execute(["notify_admin_email", "1"]);
require $root."/backend/src/Mailer.php";
$m = new Mailer();
$order = ["order_number"=>"ЛК-ТЕСТ-121","customer_name"=>"Тест","customer_phone"=>"0","delivery_method"=>"city","address"=>"","comment"=>"","total_kopecks"=>10000];
$r1 = $m->sendOrderToAdmin($order, []);
$set->execute(["notify_admin_email", "0"]);
$sizeBefore = @filesize($root."/backend/storage/mail.log") ?: 0;
$m2 = new Mailer();
$r2 = $m2->sendOrderToAdmin($order, []);
$sizeAfter = @filesize($root."/backend/storage/mail.log") ?: 0;
/* восстановление исходных значений */
foreach (json_decode(file_get_contents("/tmp/t121-mail-old.json"), true) as $k => $v) { $set->execute([$k, (string)$v]); }
echo ($r1 === true && $r2 === true && $sizeAfter === $sizeBefore) ? "toggle-ok" : "toggle-fail:$r1:$r2:$sizeBefore:$sizeAfter";
' "$ROOT" > /tmp/t121-mailtoggle.txt 2>/dev/null
grep -q "^toggle-ok$" /tmp/t121-mailtoggle.txt && ok "Mailer: дубль админу пишется (вкл) и НЕ пишется (выкл)" || bad "тумблер почты: $(cat /tmp/t121-mailtoggle.txt)"

echo "── 4. API (:8031) ──"
PORT=8031; BASE="http://127.0.0.1:$PORT/api"; LOG=/tmp/t121-php.log
export PHP_CLI_SERVER_WORKERS=8
pkill -f "127.0.0.1:$PORT" 2>/dev/null; sleep 1
( setsid "$PHP" -S 127.0.0.1:$PORT backend/public/index.php >"$LOG" 2>&1 & )
UP=1
for i in $(seq 1 30); do curl -s "$BASE/health" | grep -q ok && { UP=0; break; }; sleep 0.3; done
[ "$UP" = "0" ] && ok "сервер :$PORT поднялся" || bad "сервер не поднялся"

ANON1=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/health")
[ "$ANON1" = "401" ] && ok "аноним → /admin/health 401" || bad "health аноним: $ANON1"
ANON2=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/admin/logins")
[ "$ANON2" = "401" ] && ok "аноним → /admin/logins 401" || bad "logins аноним: $ANON2"

CJ=/tmp/t121-cookies.txt
LOGIN=$(curl -s -c "$CJ" -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@lakomka.local","password":"Lakomka2026!"}')
echo "$LOGIN" | grep -q "super_admin\|\"ok\"\|token" && ok "логин администратором" || bad "логин: $LOGIN"

HEALTH=$(curl -s -b "$CJ" "$BASE/admin/health")
[ "$(jget "$HEALTH" data.orders_new | grep -c '^[0-9]*$')" = "1" ] && ok "health: orders_new — число" || bad "health.orders_new: $(jget "$HEALTH" data.orders_new)"
[ "$(jget "$HEALTH" data.uploads.writable)" = "true" ] && ok "health: uploads writable=true" || bad "uploads.writable: $(jget "$HEALTH" data.uploads.writable)"
[ "$(jget "$HEALTH" data.backups.interval_days)" = "3" ] && ok "health: backup interval по умолчанию 3" || bad "interval: $(jget "$HEALTH" data.backups.interval_days)"
[ "$(jget "$HEALTH" data.products_total)" != "" ] && ok "health: products_total есть" || bad "products_total пуст"
echo "$HEALTH" | grep -q "smtp_pass\|tg_bot_token" && bad "health УТЕЧКА секретов" || ok "health: секретов (smtp_pass/tg_bot_token) нет"

ST1=$(curl -s -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d '{"notify_admin_email":"1","backup_interval_days":"5"}')
[ "$(jget "$ST1" data.ok)" = "true" ] && ok "настройки: notify=1, interval=5 сохранены" || bad "save settings: $ST1"
ST2=$(curl -s -b "$CJ" "$BASE/admin/settings")
[ "$(jget "$ST2" data.backup_interval_days)" = "5" ] && ok "настройки: interval=5 прочитан" || bad "interval после записи: $(jget "$ST2" data.backup_interval_days)"
[ "$(jget "$ST2" data.notify_admin_email)" = "1" ] && ok "настройки: notify=1 прочитан" || bad "notify после записи: $(jget "$ST2" data.notify_admin_email)"
ST3=$(curl -s -o /dev/null -w '%{http_code}' -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d '{"backup_interval_days":"abc"}')
[ "$ST3" = "422" ] && ok "настройки: interval «abc» → 422" || bad "interval abc: $ST3"
ST4=$(curl -s -o /dev/null -w '%{http_code}' -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d '{"backup_interval_days":"99"}')
[ "$ST4" = "422" ] && ok "настройки: interval 99 → 422" || bad "interval 99: $ST4"
curl -s -b "$CJ" -X POST "$BASE/admin/settings" -H "Content-Type: application/json" -d '{"backup_interval_days":"3"}' > /dev/null

LOGINLOG=$(curl -s -b "$CJ" "$BASE/admin/logins")
echo "$LOGINLOG" | grep -q "admin@lakomka.local" && ok "logins: попытка логина видна" || bad "logins пуст"
[ "$(jget "$LOGINLOG" data.items.0.success)" = "1" ] && ok "logins: свежая попытка — успех" || bad "logins.0.success: $(jget "$LOGINLOG" data.items.0.success)"

PG=$(curl -s -b "$CJ" "$BASE/admin/products?page=1&per_page=10")
[ "$(jget "$PG" pages)" != "" ] && [ "$(jget "$PG" total)" != "" ] && ok "пагинация: total/pages в ответе" || bad "нет total/pages"
CNT=$(echo "$PG" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d['data']))" 2>/dev/null)
[ "${CNT:-99}" -le 10 ] && ok "пагинация: per_page=10 respected ($CNT строк)" || bad "строк на странице: $CNT"
[ "$(jget "$PG" page)" = "1" ] && ok "пагинация: page=1" || bad "page: $(jget "$PG" page)"
echo "$PG" | grep -q "categories_present" && ok "пагинация: фасет categories_present" || bad "нет categories_present"
echo "$PG" | grep -q "category_thumbs" && ok "пагинация: фасет category_thumbs" || bad "нет category_thumbs"
echo "$PG" | grep -q "weight_steps" && ok "пагинация: фасет weight_steps" || bad "нет weight_steps"
PGX=$(curl -s -b "$CJ" "$BASE/admin/products?page=999&per_page=10")
[ "$(jget "$PGX" page)" = "$(jget "$PGX" pages)" ] && [ "$(jget "$PGX" pages)" != "" ] && ok "пагинация: страница > страниц зажимается" || bad "clamp: $(jget "$PGX" page)/$(jget "$PGX" pages)"
QNAME=$(jget "$PG" data.0.name | cut -c1-4)
PGQ=$(curl -s -b "$CJ" --get --data-urlencode "page=1" --data-urlencode "per_page=10" --data-urlencode "q=$QNAME" "$BASE/admin/products")
echo "$PGQ" | grep -qi "$QNAME" && ok "пагинация: поиск q= работает" || bad "поиск по «$QNAME» пуст"
PGS=$(curl -s -b "$CJ" "$BASE/admin/products?page=1&per_page=200&sort=price_asc")
SORTOK=$(echo "$PGS" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']
prices=[p['price_kopecks'] for p in d]
print('yes' if prices == sorted(prices) else 'no')" 2>/dev/null)
[ "$SORTOK" = "yes" ] && ok "пагинация: sort=price_asc отсортировано" || bad "сортировка сломана"
LEG=$(curl -s -b "$CJ" "$BASE/admin/products")
echo "$LEG" | python3 -c "import json,sys; d=json.load(sys.stdin); assert 'total' not in d and isinstance(d['data'], list)" 2>/dev/null && ok "легаси-режим (без page): ответ {data:[…]}, total нет" || bad "легаси-режим сломан"
LEGF=$(curl -s -b "$CJ" "$BASE/admin/products?filter=recipe")
echo "$LEGF" | python3 -c "import json,sys; d=json.load(sys.stdin); assert all(p['type']=='recipe' for p in d['data'][:5])" 2>/dev/null && ok "легаси: filter=recipe работает (BundleEditor/Рецепты не сломаны)" || bad "filter=recipe сломан"

pkill -f "127.0.0.1:$PORT" 2>/dev/null
rm -f /tmp/t121-cookies.txt /tmp/t121-mail-old.json
echo "── ИТОГ: PASS=$PASS FAIL=$FAIL ──"
[ "$FAIL" = "0" ] && echo "ALL OK" || exit 1
