#!/usr/bin/env bash
# Run a command with the PairADice logins and secrets from the macOS Keychain in its environment.
# Items: account "pairadice", service "pairadice/<key>". Values are never printed or written to a file.
# Usage: scripts/dev-keychain.sh bun run dev
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <command> [args...]" >&2
  exit 2
fi

missing=()

# load <keychain key> <env var>: export the secret, or remember the key name when it is absent
load() {
  local key="$1" var="$2" value
  if value="$(security find-generic-password -a pairadice -s "pairadice/${key}" -w 2>/dev/null)" && [ -n "$value" ]; then
    export "${var}=${value}"
  else
    missing+=("pairadice/${key}")
  fi
}

# load_optional <keychain key> <env var>: like load, but a missing item is skipped quietly
load_optional() {
  local key="$1" var="$2" value
  if value="$(security find-generic-password -a pairadice -s "pairadice/${key}" -w 2>/dev/null)" && [ -n "$value" ]; then
    export "${var}=${value}"
  fi
}

# login: <env user var>=<fixed login name>, password from the keychain key
login() {
  local suffix="$1" user="$2" key="$3"
  export "PD_DB_USER_${suffix}=${user}"
  load "$key" "PD_DB_PWD_${suffix}"
}

login WEB pd_web pd_web
login AUTH pd_auth pd_auth
login PLAYER pd_api pd_api
login MODERATOR pd_mod pd_mod
login ADMIN pd_admin pd_admin
load auth_secret AUTH_SECRET
load_optional discord_client_id DISCORD_CLIENT_ID
load_optional discord_client_secret DISCORD_CLIENT_SECRET

# MongoDB: the web process is read-only (pdApi). The password is URL-encoded by node from the environment,
# so it never appears on a command line; the URI exists only in this process tree's environment.
load mongo_api MONGO_API_PWD
if [ -n "${MONGO_API_PWD:-}" ]; then
  enc="$(node -e 'process.stdout.write(encodeURIComponent(process.env.MONGO_API_PWD))')"
  export MONGO_URI="mongodb://pdApi:${enc}@127.0.0.1:${MONGO_PORT:-27018}/?directConnection=true&authSource=pairadice_vec"
  unset enc
fi

if [ "${#missing[@]}" -gt 0 ]; then
  echo "warning: Keychain items not found: ${missing[*]}" >&2
fi

exec "$@"
