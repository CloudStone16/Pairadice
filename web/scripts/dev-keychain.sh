#!/usr/bin/env bash
# Load PairADice secrets from the macOS Keychain into env vars, then exec the command.
# Usage: scripts/dev-keychain.sh bun run dev
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <command> [args...]" >&2
  exit 2
fi

load() {
  local key="$1" var="$2" value
  if value="$(security find-generic-password -a pairadice -s "pairadice/${key}" -w 2>/dev/null)" && [ -n "$value" ]; then
    export "${var}=${value}"
  else
    echo "warning: Keychain key pairadice/${key} not found (${var} left unset)" >&2
  fi
}

load pd_web PD_WEB_PWD
load pd_auth PD_AUTH_PWD
load pd_api PD_API_PWD
load pd_mod PD_MOD_PWD
load pd_admin PD_ADMIN_PWD
load auth_secret AUTH_SECRET
load mongo_api MONGO_API_PWD

exec "$@"
