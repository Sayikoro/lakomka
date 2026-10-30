#!/usr/bin/env bash
# ============================================================
# Публикация релиза обновления «Лакомки» на GitHub.
#
#   bash scripts/gh-release.sh download/lakomka-update-<версия>.zip [notes.md]
#
# ZIP обновления коммитится В ТЕГ релиза (updates/lakomka-update-<версия>.zip)
# и живёт на raw-ссылке:
#   https://github.com/Sayikoro/lakomka/raw/v<версия>/updates/lakomka-update-<версия>.zip
# (резервный путь для сайтов — tar.gz тега через codeload.github.com).
# Релиз с заметками создаётся по тегу через API. Развёрнутые сайты
# находят это кнопкой «Проверить обновления (ГИТ)» (/update или админка).
#
# Повторный деплой той же версии: старый релиз и тег удаляются, затем
# создаются заново. Токен — из .secrets/gh_pat.enc, никогда не печатается.
# ============================================================
set -euo pipefail

ROOT="/home/z/my-project"
REPO="Sayikoro/lakomka"
BASE="https://api.github.com/repos/$REPO"
CLONE="$ROOT/lakomka"

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
CRED=(-c "credential.helper=!f() { printf 'username=x-access-token\npassword=%s\n' \"$GH_TOKEN\"; }; f")

TMP_JSON="$(mktemp)"
trap 'rm -f "$TMP_JSON" "$TMP_JSON.rel"; git -C "$CLONE" worktree remove --force "$WT" 2>/dev/null || true' EXIT

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
fi
if git -C "$CLONE" rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  git -C "$CLONE" tag -d "$TAG" >/dev/null
fi
curl -sS -X DELETE -H "Authorization: Bearer $GH_TOKEN" "$BASE/git/refs/tags/$TAG" -o /dev/null || true

# 2) ZIP → отдельный коммит в теге (в дереве тега только updates/)
WT="$(mktemp -d)/wt"
git -C "$CLONE" worktree add --detach "$WT" >/dev/null 2>&1
mkdir -p "$WT/updates"
cp "$ZIP" "$WT/updates/$NAME"
git -C "$WT" add -f "updates/$NAME"
git -C "$WT" -c user.name="Z.ai" -c user.email="agent@z.ai" \
  commit -q -m "release: обновление $VER" --no-verify
git -C "$WT" tag -a "$TAG" -m "Обновление $VER"
echo "  тег $TAG создан (в дереве: updates/$NAME, $(stat -c%s "$ZIP") байт)"

# 3) пуш тега
git -C "$WT" "${CRED[@]}" push -q origin "refs/tags/$TAG"
echo "  тег отправлен на origin"

# 4) заметки релиза → JSON
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
    "name": "Обновление " + sys.argv[2],
    "body": sys.argv[3],
    "draft": False,
    "prerelease": False,
}
open(sys.argv[4], "w").write(json.dumps(payload, ensure_ascii=False))
' "$TAG" "$VER" "$NOTES_TEXT" "$TMP_JSON"

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
echo "  релиз создан (id=$RID, заметки по тегу $TAG)"

echo "  raw-ссылка: https://github.com/$REPO/raw/$TAG/updates/$NAME"
echo "  sha256: $(sha256sum "$ZIP" | cut -d' ' -f1)"
echo "готово — релиз доступен сайтам кнопкой «Проверить обновления (ГИТ)»."
