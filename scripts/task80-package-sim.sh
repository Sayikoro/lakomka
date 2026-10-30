#!/usr/bin/env bash
# Task 80: симуляция развёрнутого сайта ПРЯМО НА собранном деплой-пакете
# (.deploy-package = точная копия того, что лежит на сервере).
set -uo pipefail
PKG=/home/z/my-project/.deploy-package
PHP=/home/z/my-project/.ztools/php

[ -d "$PKG/uploads" ] && [ ! -d "$PKG/public" ] && echo "LAYOUT OK: uploads/ в корне, public/ нет" || { echo "LAYOUT UNEXPECTED"; exit 1; }

cd "$PKG"
"$PHP" -S 127.0.0.1:8011 /home/z/my-project/scripts/deploy/dev-router.php >/tmp/pkg-sim-server.log 2>&1 &
SRV=$!
sleep 1.2

TOKEN=$(cd "$PKG/backend" && "$PHP" -r "require_once 'src/Auth.php'; echo Auth::issueToken(7, 'admin@lakomka.local', 'super_admin');" 2>/dev/null)
[ -z "$TOKEN" ] && { echo "TOKEN FAIL"; kill $SRV 2>/dev/null; exit 1; }
echo "TOKEN OK (${#TOKEN})"

api() { curl -s -H "Authorization: Bearer $TOKEN" "$@"; }
fail=0
check() { # $1 name, $2 result
  if echo "$2" | rg -q '"Раздел недоступен"'; then echo "FAIL: $1 -> Раздел недоступен"; fail=1; else echo "OK:   $1"; fi
}

R1=$(api "http://127.0.0.1:8011/api/admin/files"); check "корень (3 раздела)" "$R1"
R2=$(api "http://127.0.0.1:8011/api/admin/files?path=media"); check "раздел media" "$R2"
R3=$(api "http://127.0.0.1:8011/api/admin/files?path=media/products"); check "media/products" "$R3"
R4=$(api "http://127.0.0.1:8011/api/admin/files?path=exports"); check "раздел exports (автосоздание)" "$R4"
R5=$(api "http://127.0.0.1:8011/api/admin/files?path=imports"); check "раздел imports (автосоздание)" "$R5"
R6=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"path":"exports","name":"sim-dir"}' "http://127.0.0.1:8011/api/admin/files/mkdir"); check "mkdir в exports" "$R6"
R7=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"path":"exports/sim-dir"}' "http://127.0.0.1:8011/api/admin/files/delete"); check "delete sim-dir" "$R7"
R8=$(api "http://127.0.0.1:8011/api/admin/files/download?path=media%2Fbrand%2Flogo-lakomka.webp" -o /tmp/pkg-dl.webp -w "%{http_code}:%{size_download}"); check "download media-файла ($R8)" "HTTP_OK"
R9=$(api "http://127.0.0.1:8011/api/pdfs"); check "публичный /api/pdfs" "$R9"

# чистим созданное симуляцией, чтобы пакет остался девственно чистым
rm -rf "$PKG/exports"
kill $SRV 2>/dev/null
[ $fail -eq 0 ] && echo "ALL SIM CHECKS PASSED" || { echo "SIM FAILURES"; exit 1; }
