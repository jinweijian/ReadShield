#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

"${ROOT_DIR}/scripts/support-mcp-auth.sh" ensure-login 1>&2
exec node "${ROOT_DIR}/dist/cmd/support-mcpd/src/main.js"
