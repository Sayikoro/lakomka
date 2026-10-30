#!/usr/bin/env bash
# gh-api.sh <METHOD> <path> [<json-body>]
# Аутентифицированный вызов GitHub API через зашифрованный PAT.
# Токен никогда не печатается; ответ API токенов не содержит.
set -euo pipefail
ROOT="/home/z/my-project"
GH_TOKEN="$(openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in "$ROOT/.secrets/gh_pat.enc" -pass "file:$ROOT/.secrets/key")"

METHOD="${1:-GET}"
PATHPART="${2:?usage: gh-api.sh <METHOD> <path> [body]}"
BODY="${3:-}"

CURLARGS=(-sS -X "$METHOD" -H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28")
if [ -n "$BODY" ]; then
  CURLARGS+=(-H "Content-Type: application/json" -d "$BODY")
fi

HTTP="${GH_API_HTTP:-}"
if [ -n "$HTTP" ]; then
  curl "${CURLARGS[@]}" -o /tmp/gh-api-out.json -w "%{http_code}" "https://api.github.com$PATHPART"
else
  curl "${CURLARGS[@]}" "https://api.github.com$PATHPART"
fi
