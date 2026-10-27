#!/usr/bin/env bash
# Push lakomka (master) to GitHub using the encrypted PAT.
# Token is stored encrypted at .secrets/gh_pat.enc (AES-256-CBC, PBKDF2 600k).
# The token is NEVER printed: all output containing it is masked.
set -euo pipefail

ROOT="/home/z/my-project"
ENC="$ROOT/.secrets/gh_pat.enc"
KEY="$ROOT/.secrets/key"

GH_TOKEN="$(openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -in "$ENC" -pass "file:$KEY")"
export GH_TOKEN

# Push via named remote (updates origin/master tracking ref).
# Credential helper is ephemeral (-c), nothing is persisted to disk.
git -C "$ROOT/lakomka" \
  -c "credential.helper=!f() { printf 'username=x-access-token\npassword=%s\n' \"\$GH_TOKEN\"; }; f" \
  push origin master 2>&1 | sed -E 's#(x-access-token|github_pat)_[A-Za-z0-9_@]+#\1_***#g'
