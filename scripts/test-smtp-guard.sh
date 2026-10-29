#!/bin/bash
# Тест защиты smtp_pass от сохранения маски-буллетов (Task 43/44)
set -e
cd /home/z/my-project

TOKEN=$(.ztools/php -r "
require_once 'backend/src/Auth.php';
echo Auth::issueToken(1, 'admin@local.test', 'super_admin');
")

echo "== 1) POST smtp_pass='••••••••' — ожидаем 422 =="
curl -s -o /tmp/guard1.json -w "http=%{http_code}\n" -X POST http://127.0.0.1:8000/api/admin/settings \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"smtp_pass":"••••••••"}'
cat /tmp/guard1.json; echo

echo "== 2) POST from_email (обычное сохранение) — ожидаем ok =="
curl -s -o /tmp/guard2.json -w "http=%{http_code}\n" -X POST http://127.0.0.1:8000/api/admin/settings \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"from_email":"admin@fixme.org.ru"}'
cat /tmp/guard2.json; echo

echo "== 3) POST smtp_pass='' (пустое = не менять) — ожидаем ok, значение не трогаем =="
curl -s -o /tmp/guard3.json -w "http=%{http_code}\n" -X POST http://127.0.0.1:8000/api/admin/settings \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"smtp_pass":""}'
cat /tmp/guard3.json; echo

echo "== 4) SMTP-конфиг в БД после тестов =="
.ztools/php -r "
\$pdo = new PDO('sqlite:backend/storage/database.sqlite');
foreach (\$pdo->query(\"SELECT key, value FROM settings WHERE key LIKE 'smtp%' OR key='from_email' ORDER BY key\") as \$r) {
  \$v = \$r['value'];
  if (\$r['key'] === 'smtp_pass') \$v = '(len=' . strlen(\$v) . ')';
  echo str_pad(\$r['key'], 14), ' => ', \$v, PHP_EOL;
}"
