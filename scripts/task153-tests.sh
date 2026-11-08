#!/bin/bash
# Task 152 tests: 12 улучшений админки + «Состав подарка» (Task 151).
# 1. Типы и линт изменённых файлов (tsc, eslint, php -l)
# 2. Маркеры реализации в коде (фронты и бэкенд)
# 3. PHP-функциональный тест контроллеров (orders/export/daily/alerts/logout-all)
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  OK  $1"; }
bad(){ FAIL=$((FAIL+1)); echo "  FAIL $1"; }
PHP="$(readlink -f "$ROOT/../.ztools/php")"

echo "── 1. Типы и линт ──"
if ./node_modules/.bin/tsc --noEmit > /tmp/tsc153.log 2>&1; then
  ok "tsc --noEmit без ошибок"
else
  bad "tsc --noEmit: $(head -3 /tmp/tsc153.log)"
fi
LINT_FILES="src/app/admin/orders/page.tsx src/app/admin/orders/view/page.tsx src/app/admin/page.tsx src/app/admin/analytics/page.tsx src/app/admin/layout.tsx src/app/admin/products/edit/page.tsx src/components/admin/ProductsTable.tsx src/components/admin/ProductForm.tsx src/components/admin/Feedback.tsx src/components/admin/DailyChart.tsx src/components/admin/LogoutAllButton.tsx src/components/admin/FilesManager.tsx src/components/admin/MassMediaOptimizer.tsx src/components/admin/SiteUpdateTab.tsx src/components/admin/CandiesManager.tsx src/components/admin/StatusChanger.tsx src/components/ui/ProductTabs.tsx src/lib/order-status.ts src/lib/types.ts src/lib/product-api.ts src/app/globals.css"
if ./node_modules/.bin/eslint $LINT_FILES > /tmp/eslint153.log 2>&1; then
  ok "eslint изменённых файлов чист"
else
  bad "eslint: $(head -5 /tmp/eslint153.log)"
fi
PHP_FILES="backend/src/Controllers/AdminOrdersController.php backend/src/Controllers/AdminDashboardController.php backend/src/Controllers/AdminProductsController.php backend/src/Controllers/AdminAnalyticsController.php backend/src/Controllers/AuthController.php backend/src/Auth.php backend/src/OrderStatuses.php backend/public/index.php scripts/task153-func.php"
PFAIL=0
for f in $PHP_FILES; do
  "$PHP" -l "$f" > /dev/null 2>&1 || { PFAIL=1; bad "php -l $f"; }
done
[ "$PFAIL" = "0" ] && ok "php -l всех изменённых файлов чист"

echo "── 2. Бэкенд: маркеры ──"
grep -q "OrderStatuses::ALL" backend/src/Controllers/AdminOrdersController.php \
  && ok "статусы в updateStatus берутся из OrderStatuses::ALL" || bad "whitelist статусов не переведён на OrderStatuses"
grep -q "buildWhere" backend/src/Controllers/AdminOrdersController.php \
  && ok "общий WHERE-конструктор для list и exportCsv" || bad "нет buildWhere"
grep -q "sum_kopecks" backend/src/Controllers/AdminOrdersController.php \
  && ok "list отдаёт сумму по фильтру (денежная сводка)" || bad "нет sum_kopecks"
grep -q "OFFSET" backend/src/Controllers/AdminOrdersController.php \
  && ok "пагинация OFFSET в списке заказов" || bad "нет OFFSET"
grep -q "exportCsv" backend/src/Controllers/AdminOrdersController.php \
  && ok "exportCsv реализован" || bad "нет exportCsv"
grep -qF 'fwrite($out, "\xEF\xBB\xBF")' backend/src/Controllers/AdminOrdersController.php \
  && ok "CSV с BOM (Excel откроет кириллицу)" || bad "CSV без BOM"
grep -q "token_version" backend/src/Auth.php \
  && ok "requireAuth сверяет token_version" || bad "Auth без token_version"
grep -q "'tv'    => \$tokenVersion" backend/src/Auth.php \
  && ok "JWT содержит tv" || bad "JWT без tv"
grep -q "logoutAll" backend/src/Controllers/AuthController.php \
  && ok "AuthController::logoutAll" || bad "нет logoutAll"
grep -q "dashboard/daily" backend/public/index.php \
  && ok "роут /api/admin/dashboard/daily" || bad "нет роута daily"
grep -q "dashboard/alerts" backend/public/index.php \
  && ok "роут /api/admin/dashboard/alerts" || bad "нет роута alerts"
grep -q "orders/export" backend/public/index.php \
  && ok "роут /api/admin/orders/export" || bad "нет роута export"
grep -q "auth/logout-all" backend/public/index.php \
  && ok "роут /api/auth/logout-all" || bad "нет роута logout-all"
grep -q "email_sent = 0" backend/src/Controllers/AdminDashboardController.php \
  && ok "тревога «письма не ушли» по email_sent=0" || bad "alerts без email_sent"
grep -q "low_stock_threshold" backend/src/Controllers/AdminDashboardController.php \
  && ok "порог «товары заканчиваются» из настройки" || bad "alerts без порога"
grep -q "low_stock" backend/src/Controllers/AdminProductsController.php \
  && ok "фильтр low_stock в списке товаров" || bad "нет фильтра low_stock"
grep -q "meta_title" backend/src/Controllers/AdminProductsController.php \
  && ok "SEO-поля в create/update товаров" || bad "нет meta_title в контроллере"
grep -q "meta_title TEXT" backend/src/schema.sql \
  && ok "schema.sql: products.meta_title" || bad "schema.sql без meta_title"
grep -q "token_version INTEGER" backend/src/schema.sql \
  && ok "schema.sql: users.token_version" || bad "schema.sql без token_version"
[ -f backend/migrations/009_seo_and_token_version.sql ] \
  && ok "миграция 009_seo_and_token_version.sql" || bad "миграции 009 нет"
grep -q "rangeParam" backend/src/Controllers/AdminAnalyticsController.php \
  && ok "аналитика: произвольный период from/to" || bad "аналитика без from/to"

echo "── 3. Фронт: маркеры ──"
grep -q "from \"@/lib/order-status\"" src/app/admin/orders/page.tsx \
  && ok "список заказов: статусы из единого источника" || bad "orders/page.tsx не импортирует order-status"
grep -q "from \"@/lib/order-status\"" src/app/admin/orders/view/page.tsx \
  && ok "карточка заказа: статусы/доставка из единого источника" || bad "orders/view не импортирует order-status"
grep -q "from \"@/lib/order-status\"" src/components/admin/StatusChanger.tsx \
  && ok "StatusChanger: статусы из единого источника" || bad "StatusChanger дублирует статусы"
grep -q "data-testid=\"orders-filters\"" src/app/admin/orders/page.tsx \
  && ok "UI фильтров заказов" || bad "нет фильтров в UI заказов"
grep -q "data-testid=\"orders-pagination\"" src/app/admin/orders/page.tsx \
  && ok "UI пагинации заказов" || bad "нет пагинации в UI"
grep -q "orders/export" src/app/admin/orders/page.tsx \
  && ok "кнопка экспорта CSV в списке" || bad "нет кнопки экспорта"
grep -q "data-testid=\"print-order\"" src/app/admin/orders/view/page.tsx \
  && ok "кнопка «Печать бланка» в карточке заказа" || bad "нет кнопки печати"
grep -q "@media print" src/app/globals.css \
  && ok "print-стили бланка заказа" || bad "нет @media print"
grep -q "data-testid=\"alert-emails\"" src/app/admin/page.tsx \
  && ok "дашборд: плитка «Письма не ушли»" || bad "нет плитки писем"
grep -q "data-testid=\"alert-low-stock\"" src/app/admin/page.tsx \
  && ok "дашборд: плитка «Товары заканчиваются»" || bad "нет плитки товаров"
grep -q "DailyChart" src/app/admin/page.tsx \
  && ok "дашборд: график динамики" || bad "дашборд без графика"
grep -q "data-testid=\"analytics-custom-period\"" src/app/admin/analytics/page.tsx \
  && ok "аналитика: произвольный период в UI" || bad "аналитика без полей дат"
grep -q "DailyChart" src/app/admin/analytics/page.tsx \
  && ok "аналитика: график динамики" || bad "аналитика без графика"
grep -q "data-testid=\"logout-all\"" src/components/admin/LogoutAllButton.tsx \
  && ok "кнопка «Выйти на всех устройствах»" || bad "нет LogoutAllButton"
grep -q "LogoutAllButton" src/app/admin/layout.tsx \
  && ok "кнопка смонтирована в сайдбаре" || bad "LogoutAllButton не в layout"
grep -q "AdminFeedbackProvider" src/app/admin/layout.tsx \
  && ok "тосты/подтверждения смонтированы в админке" || bad "нет AdminFeedbackProvider"
grep -q 'roles: \["super_admin", "editor"\]' src/app/admin/layout.tsx \
  && ok "«Файлы» и «PDF» скрыты от viewer" || bad "меню без roles"
grep -q "!item.roles" src/app/admin/layout.tsx \
  && ok "меню фильтруется по роли" || bad "фильтрации меню по роли нет"
grep -q "data-testid=\"product-category\"" src/components/admin/ProductForm.tsx \
  && ok "форма товара: выбор категории" || bad "нет категории в форме"
grep -q 'name="meta_title"\|value={form.meta_title}' src/components/admin/ProductForm.tsx \
  && ok "форма товара: SEO-поля" || bad "нет SEO в форме"
grep -q "low_stock" src/components/admin/ProductsTable.tsx \
  && ok "список товаров: фильтр «Заканчиваются»" || bad "таблица без low_stock"
grep -q "product.meta_title" 'src/app/(shop)/product/[slug]/page.tsx' \
  && ok "витрина: generateMetadata читает SEO-поля" || bad "витрина без meta_title"
if grep -rn "window.confirm\|window.alert" src/components/admin src/app/admin 2>/dev/null | grep -v "Feedback.tsx" | grep -v "Раньше" > /dev/null; then
  bad "остались window.confirm/alert: $(grep -rln 'window.confirm|window.alert' src/components/admin src/app/admin 2>/dev/null | head -2)"
else
  ok "window.confirm/alert в админке не осталось (кроме комментария Feedback)"
fi

echo "── 4. PHP-функциональный тест контроллеров ──"

"$PHP" scripts/task153-func.php seed > /dev/null 2>&1 \
  && ok "seed тестовых заказов и товаров" || bad "seed не прошёл"

EXP="$("$PHP" scripts/task153-func.php expect-basic 2>/dev/null)"
E_T=$(echo "$EXP" | grep -oP 'total=\d+' | cut -d= -f2)
E_S=$(echo "$EXP" | grep -oP 'sum=\d+' | cut -d= -f2)
J="$("$PHP" scripts/task153-func.php list-basic 2>/dev/null | python3 -c "
import json,sys
j=json.load(sys.stdin)
print(j['total'], j['sum_kopecks'], j['pages'], j['per_page'], len(j['data']))
")"
read -r A_T A_S A_PG A_PP A_R <<< "$J"
[ -n "$A_T" ] && [ "$A_T" = "$E_T" ] && ok "list: total=$A_T совпадает с SQL" || bad "list total: api=$A_T sql=$E_T"
[ -n "$A_S" ] && [ "$A_S" = "$E_S" ] && ok "list: денежная сводка $A_S коп. совпадает с SQL" || bad "list sum: api=$A_S sql=$E_S"
[ "$A_PG" = "1" ] && [ "$A_PP" = "50" ] && ok "list: страницы=1, per_page по умолчанию 50" || bad "list pages: $J"

EXP="$("$PHP" scripts/task153-func.php expect-pagination 2>/dev/null)"
J="$("$PHP" scripts/task153-func.php list-pagination 2>/dev/null | python3 -c "
import json,sys
j=json.load(sys.stdin)
print(j['total'], j['pages'], len(j['data']), j['data'][0]['order_number'] if j['data'] else '')
")"
read -r A_T A_PG A_R A_FIRST <<< "$J"
E_T=$(echo "$EXP" | grep -oP 'total=\d+' | cut -d= -f2)
E_PG=$(echo "$EXP" | grep -oP 'pages=\d+' | cut -d= -f2)
E_R=$(echo "$EXP" | grep -oP 'rows=\d+' | cut -d= -f2)
[ "$A_T" = "$E_T" ] && ok "pagination: total=12" || bad "pagination total: $J"
[ "$A_PG" = "$E_PG" ] && ok "pagination: 12 заказов / per_page=10 → 2 страницы" || bad "pagination pages: api=$A_PG exp=$E_PG"
[ "$A_R" = "$E_R" ] && ok "pagination: страница 2 — последние 2 записи" || bad "pagination rows: api=$A_R exp=$E_R"
[ "$A_FIRST" = "T153-P02" ] && ok "pagination: DESC-порядок (страница 2 начинается с T153-P02)" || bad "pagination order: $A_FIRST"

echo "── 5. Фильтры списка заказов (API vs SQL) ──"
"$PHP" scripts/task153-func.php seed > /dev/null 2>&1  # пересеять: после pagination в БД сид T153-P*
FILTER_LABELS=(
  "status=done|статус «Выполнен»"
  "phone=%2B7%20914%20111-11-11|телефон (точный, blind index)"
  "number=002|номер заказа (LIKE)"
  "email=0|письмо не отправлено"
  "email=1|письмо отправлено"
  "from=$("$PHP" -r 'echo date("Y-m-d", time()-5*86400);')&to=$("$PHP" -r 'echo date("Y-m-d");')|период «последние 5 дней»"
)
FILTER_LABELS+=(
  "status=cancelled&from=$("$PHP" -r 'echo date("Y-m-d", time()-50*86400);')&to=$("$PHP" -r 'echo date("Y-m-d", time()-30*86400);')|статус+период (комбинация)"
)
for ENTRY in "${FILTER_LABELS[@]}"; do
  QS="${ENTRY%%|*}"; LABEL="${ENTRY#*|}"
  E=$("$PHP" scripts/task153-func.php expect-one "$QS" 2>/dev/null | grep -oP 'sql=-?\d+' | cut -d= -f2)
  J="$("$PHP" scripts/task153-func.php list-one "$QS" 2>/dev/null | python3 -c "
import json,sys
j=json.load(sys.stdin)
print(j['total'], len(j['data']))
" 2>/dev/null)"
  read -r A_T A_R <<< "$J"
  if [ -n "$A_T" ] && [ "$A_T" = "$E" ] && [ "$A_R" = "$E" ]; then
    ok "фильтр «$LABEL»: api=$A_T = sql=$E"
  else
    bad "фильтр «$LABEL»: api=$A_T sql=$E ($J)"
  fi
done

J="$("$PHP" scripts/task153-func.php list-bad-phone 2>/dev/null | python3 -c "
import json,sys
j=json.load(sys.stdin)
print(j['total'], len(j['data']))
")"
echo "$J" | grep -q "^0 0" && ok "невалидный телефон → пустой результат (не 500)" || bad "bad-phone: $J"

echo "── 6. Экспорт CSV ──"
CSV="$("$PHP" scripts/task153-func.php export 2>/dev/null)"
python3 - "$CSV" <<'PYEOF'
import sys
csv = sys.argv[1]
lines = [l for l in csv.splitlines() if l.strip()]
fails = 0
def check(cond, ok_msg, bad_msg):
    global fails
    if cond: print("  OK  " + ok_msg)
    else:
        fails += 1
        print("  FAIL " + bad_msg)
check(csv.startswith("\ufeff") or csv.startswith("\xEF\xBB\xBF"), "export: BOM в начале файла", "export: BOM отсутствует")
check(len(lines) == 2, "export: заголовок + 1 заказ (status=paid)", f"export: строк {len(lines)} (ожидалось 2)")
check("Оплачен" in csv, "export: статус человекочитаем («Оплачен»)", "export: статус не расшифрован")
check("T153-001" not in csv, "export: фильтр status=paid respected", "export: лишние заказы попали в CSV")
check("2500,00" in csv, "export: сумма в рублях с копейками (2500,00)", "export: сумма не в ожидаемом формате")
sys.exit(1 if fails else 0)
PYEOF
[ $? = "0" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

echo "── 7. Дашборд: daily и alerts ──"
EXP="$("$PHP" scripts/task153-func.php expect-daily 2>/dev/null)"
E_C=$(echo "$EXP" | grep -oP 'cnt=\d+' | cut -d= -f2)
E_S=$(echo "$EXP" | grep -oP 'sum=\d+' | cut -d= -f2)
"$PHP" scripts/task153-func.php daily > /tmp/t153-daily.json 2>/dev/null
python3 - "/tmp/t153-daily.json" "$E_C" "$E_S" <<'PYEOF'
import json, sys
j = json.load(open(sys.argv[1]))
days = j["data"]["days"]
e_c, e_s = int(sys.argv[2]), int(sys.argv[3])
fails = 0
def check(cond, ok_msg, bad_msg):
    global fails
    if cond: print("  OK  " + ok_msg)
    else:
        fails += 1
        print("  FAIL " + bad_msg)
check(len(days) == 14, "daily: 14 дней непрерывной шкалы", f"daily: {len(days)} дней")
dates = [d["date"] for d in days]
check(len(dates) == len(set(dates)) and dates[0] < dates[-1], "daily: даты монотонны без дыр", "daily: дыры в шкале")
today = days[-1]
check(today["orders"] == e_c, f"daily: заказы за сегодня {today['orders']} = SQL {e_c}", f"daily: api={today['orders']} sql={e_c}")
check(today["orders_sum_kopecks"] == e_s, "daily: сумма за сегодня сходится", f"daily sum: api={today['orders_sum_kopecks']} sql={e_s}")
import datetime
allowed = {
    datetime.date.today().isoformat(),
    (datetime.date.today() - datetime.timedelta(days=3)).isoformat(),
}
bad_days = [d["date"] for d in days if (d["orders"] > 0 or d["orders_sum_kopecks"] > 0) and d["date"] not in allowed]
check(not bad_days, "daily: вне тестовых дат всё по нулям", f"daily: nonzero вне сидов: {bad_days}")
sys.exit(1 if fails else 0)
PYEOF
[ $? = "0" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

EXP="$("$PHP" scripts/task153-func.php expect-alerts 2>/dev/null)"
E_EM=$(echo "$EXP" | grep -oP 'emails=\d+' | cut -d= -f2)
"$PHP" scripts/task153-func.php alerts > /tmp/t153-alerts.json 2>/dev/null
python3 - "/tmp/t153-alerts.json" "$E_EM" <<'PYEOF'
import json, sys
j = json.load(open(sys.argv[1]))["data"]
e_em = int(sys.argv[2])
fails = 0
def check(cond, ok_msg, bad_msg):
    global fails
    if cond: print("  OK  " + ok_msg)
    else:
        fails += 1
        print("  FAIL " + bad_msg)
check(j["emails_failed"]["count"] == e_em, f"alerts: письма не ушли — {e_em} шт.", f"alerts emails: api={j['emails_failed']['count']} sql={e_em}")
names = [i["name"] for i in j["low_stock"]["items"]]
check(j["low_stock"]["threshold"] == 5, "alerts: порог по умолчанию 5", f"alerts threshold: {j['low_stock']['threshold']}")
# список — первые 8 по (stock ASC, id ASC); в прод-синхронизированной БД
# низкий остаток может быть у многих товаров. Проверяем правила отбора:
check(all(i["stock_qty"] <= 5 for i in j["low_stock"]["items"]), "alerts: все элементы ≤ порога", "alerts: элемент выше порога")
check(len(names) == min(8, j["low_stock"]["count"]), "alerts: топ-8 не шире счётчика", f"alerts: элементов {len(names)} при count={j['low_stock']['count']}")
check("T153 Достаточно" not in names, "alerts: товар с остатком 9 не входит", "alerts: остаток 9 попал в тревогу")
check("T153 Скрытый с нулём" not in names, "alerts: неопубликованный товар исключён", "alerts: неопубликованный в тревоге")
check(j["low_stock"]["count"] >= 2, "alerts: счётчик учитывает T153-товары (0 и 3)", f"alerts count: {j['low_stock']['count']}")
sys.exit(1 if fails else 0)
PYEOF
[ $? = "0" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))

echo "── 8. Отзыв токенов (logout-all) ──"
T0=$("$PHP" scripts/task153-func.php tv 2>/dev/null | grep -oP 'tv=\d+' | cut -d= -f2)
"$PHP" scripts/task153-func.php logout-all > /dev/null 2>&1
T1=$("$PHP" scripts/task153-func.php tv 2>/dev/null | grep -oP 'tv=\d+' | cut -d= -f2)
[ "$((T0 + 1))" = "$T1" ] && ok "logout-all: token_version $T0 → $T1" || bad "logout-all: tv=$T0 → $T1"
STALE="$("$PHP" scripts/task153-func.php require-auth-stale 2>/dev/null)"
echo "$STALE" | python3 -c '
import json, sys
raw = sys.stdin.read().strip()
try:
    err = json.loads(raw).get("error", "")
except Exception:
    err = raw
sys.exit(0 if "отозвана" in err else 1)
' \
  && ok "старый токен (tv меньше актуального) отклонён requireAuth" \
  || bad "stale token принят: $STALE"

echo "── 9. Гигиена после тестов ──"
F="$("$PHP" scripts/task153-func.php cleanup 2>/dev/null)"
echo "$F" | grep -q "left_orders=0;left_products=0" && ok "cleanup: тестовые заказы и товары удалены" || bad "cleanup: $F"

echo ""
echo "ИТОГО: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" = "0" ]
