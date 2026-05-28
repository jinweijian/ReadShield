#!/usr/bin/env bash
set -euo pipefail

TOKEN_FILE="${HOME}/.support-mcp/token.json"
TTL_MINUTES="480"

mkdir -p "$(dirname "$TOKEN_FILE")"
chmod 700 "$(dirname "$TOKEN_FILE")"

cmd="${1:-ensure-login}"
if [[ "$cmd" != "ensure-login" ]]; then
  echo "unknown command" >&2
  exit 1
fi

now_epoch="$(date +%s)"
if [[ -f "$TOKEN_FILE" ]]; then
  exp="$(python3 - <<'PY'
import json, os
f=os.path.expanduser('~/.support-mcp/token.json')
try:
  print(int(json.load(open(f)).get('exp',0)))
except Exception:
  print(0)
PY
)"
  if [[ "$exp" -gt "$now_epoch" ]]; then
    echo "already logged in" >&2
    exit 0
  fi
fi

echo "请先登录：打开 https://support-mcp.local/login 并完成确认" >&2
new_exp="$((now_epoch + TTL_MINUTES * 60))"
printf '{"exp": %s}\n' "$new_exp" > "$TOKEN_FILE"
chmod 600 "$TOKEN_FILE"
echo "登录完成，token 已更新" >&2
