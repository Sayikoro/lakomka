#!/usr/bin/env bash
# ============================================================
# Публикация релиза обновления «Лакомки» на GitHub.
#
#   bash scripts/gh-release.sh download/lakomka-update-<версия>.zip [notes.md]
#
# Создаёт релиз с тегом v<версия> (на текущем master) и прикрепляет
# ZIP как ассет. Развёрнутые сайты находят его кнопкой
# «Проверить обновления (ГИТ)» (/update или админка → Настройки).
# Если релиз с таким тегом уже существует — удаляется и создаётся
# заново (повторный деплой той же версии перезаписывает релиз).
#
# Токен берётся из .secrets/gh_pat.enc и никогда не печатается.
# ============================================================
set -euo pipefail

ROOT="/home/z/my-project"
REPO="Sayikoro/lakomka"
BASE="https://api.github.com/repos/$REPO"
UPLOADS="https://uploads.github.com/repos/$REPO"

ZIP="${1:?usage: gh-release.sh download/lakomka-update-<версия>.zip [notes.md]}"
NOTES="${2:-}"

[ -f "$ZIP" ] || { echo "нет файла: $ZIP"; exit 1; }
NAME="$(basename "$ZIP")"
case "$NAME" in
  lakomka-update-*.zip) VER="${NAME#lakomka-update-}"; VER="${VER%.zip}" ;;
  *) echo "имя файла должно быть lakomka-update-<версия>.zip (получено: $NAME)"; exit 1 ;;
esac
TAG="v$VER"
echo "релиз: $TAG  ←  $NAME ($(du -h "$ZIP" | cut -f1))"

GH_TOKEN="$(openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in "$ROOT/.secrets/gh_pat.enc" -pass "file:$ROOT/.secrets/key")"

TMP_JSON="$(mktemp)"
cleanup() { rm -f "$TMP_JSON" "$TMP_JSON.body" "$TMP_JSON.rel" "$TMP_JSON.asset"; }
trap cleanup EXIT

# 1) существующий релиз с таким тегом → удалить вместе с тегом
RID="$(curl -sS -X GET -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" "$BASE/releases/tags/$TAG" \
  | python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)
    print(str(d.get("id", "")) if isinstance(d, dict) else "")
except Exception:
    print("")')"
if [ -n "$RID" ]; then
  echo "  удаляю существующий релиз id=$RID (тег $TAG)"
  curl -sS -X DELETE -H "Authorization: Bearer $GH_TOKEN" "$BASE/releases/$RID" -o /dev/null
  curl -sS -X DELETE -H "Authorization: Bearer $GH_TOKEN" "$BASE/git/refs/tags/$TAG" -o /dev/null || true
fi

# 2) текст релиза → JSON-полезная нагрузка
if [ -n "$NOTES" ] && [ -f "$NOTES" ]; then
  NOTES_TEXT="$(cat "$NOTES")"
else
  NOTES_TEXT="Обновление сайта «Лакомка» ${VER}.

Ставится кнопкой «Проверить обновления (ГИТ)» на странице /update
или в админке (Настройки → Обновление). Медиа и база данных не затрагиваются."
fi
python3 -c '
import json, sys
payload = {
    "tag_name": sys.argv[1],
    "target_commitish": "master",
    "name": "Обновление " + sys.argv[2],
    "body": sys.argv[3],
    "draft": False,
    "prerelease": False,
}
open(sys.argv[4], "w").write(json.dumps(payload, ensure_ascii=False))
' "$TAG" "$VER" "$NOTES_TEXT" "$TMP_JSON"

# 3) создать релиз
curl -sS -X POST \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/vnd.github+json" \
  --data-binary @"$TMP_JSON" \
  "$BASE/releases" > "$TMP_JSON.rel"

RID="$(python3 -c 'import json,sys
d = json.load(open(sys.argv[1]))
print(str(d["id"]) if isinstance(d, dict) and d.get("id") else "")' "$TMP_JSON.rel")"
if [ -z "$RID" ]; then
  echo "ОШИБКА создания релиза:"; head -c 500 "$TMP_JSON.rel"; echo; exit 1
fi
echo "  релиз создан (id=$RID, тег $TAG на master)"

# 4) прикрепить ZIP как ассет
curl -sS -X POST \
  -H "Authorization: Bearer $GH_TOKEN" \
  -H "Content-Type: application/zip" \
  --data-binary @"$ZIP" \
  "$UPLOADS/$RID/assets?name=$NAME" > "$TMP_JSON.asset"

AURL="$(python3 -c 'import json,sys
d = json.load(open(sys.argv[1]))
print(d.get("browser_download_url", ""))' "$TMP_JSON.asset")"
if [ -z "$AURL" ]; then
  echo "ОШИБКА загрузки ассета:"; head -c 500 "$TMP_JSON.asset"; echo; exit 1
fi

ASIZE="$(python3 -c 'import json,sys
d = json.load(open(sys.argv[1]))
print(d.get("size", 0))' "$TMP_JSON.asset")"
LOCAL_SHA="$(sha256sum "$ZIP" | cut -d" " -f1)"
echo "  ассет загружен: $AURL ($ASIZE байт)"
echo "  sha256: $LOCAL_SHA"
echo "готово — релиз доступен сайтам кнопкой «Проверить обновления (ГИТ)»."
