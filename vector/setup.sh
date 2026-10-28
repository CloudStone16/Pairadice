#!/usr/bin/env bash
# Set up the PairADice MongoDB vector store: Atlas Local container, collections + indexes, full sync.
# Works from bash or zsh (runs under bash). Usage: ./vector/setup.sh --help
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER="pairadice-mongo"
IMAGE="mongodb/mongodb-atlas-local:8.0"
MONGO_PORT="27018"            # 27017 is often taken by a Homebrew mongod
RESET=0
BACKFILL=1

usage() {
  cat <<EOF
Set up the PairADice vector store (MongoDB Atlas Local in Docker, database pairadice_vec).
Run ./database/setup.sh first: the backfill reads the MySQL database.

Usage: $(basename "$0") [options]

      --port PORT       host port for MongoDB          (default: 27018, bound to 127.0.0.1 only)
      --reset           drop the pairadice_vec database before creating it
      --no-backfill     create collections and indexes only
      --help            show this help

MySQL connection for the backfill: \$MYSQL_USER (default root), \$MYSQL_HOST, \$MYSQL_PORT.
The MySQL password is read from \$MYSQL_PWD if set, otherwise prompted for (input hidden).
EOF
}

if [[ -t 1 ]]; then C_OK=$'\033[32m'; C_ERR=$'\033[31m'; C_OFF=$'\033[0m'; else C_OK=""; C_ERR=""; C_OFF=""; fi
step() { printf '%s==>%s %s\n' "$C_OK" "$C_OFF" "$*"; }
die()  { printf '%serror:%s %s\n' "$C_ERR" "$C_OFF" "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port)        MONGO_PORT="${2:?missing value for $1}"; shift 2 ;;
    --reset)       RESET=1; shift ;;
    --no-backfill) BACKFILL=0; shift ;;
    --help)        usage; exit 0 ;;
    *)             usage >&2; die "unknown option: $1" ;;
  esac
done

command -v docker >/dev/null 2>&1 || die "docker not found. Install Docker Desktop first."
command -v node   >/dev/null 2>&1 || die "node not found. Install Node.js 20+ first."
docker info >/dev/null 2>&1       || die "the Docker daemon is not running (macOS: open -a Docker)."

# ---------------------------------------------------------------- container
if docker container inspect "$CONTAINER" >/dev/null 2>&1; then
  if [[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER")" != "true" ]]; then
    step "Starting existing container $CONTAINER"
    docker start "$CONTAINER" >/dev/null
  else
    step "Container $CONTAINER is already running"
  fi
else
  step "Creating container $CONTAINER ($IMAGE) on 127.0.0.1:$MONGO_PORT"
  docker run -d --name "$CONTAINER" -p "127.0.0.1:${MONGO_PORT}:27017" \
    -v pairadice-mongo-data:/data/db -v pairadice-mongo-config:/data/configdb \
    "$IMAGE" >/dev/null
fi

step "Waiting for MongoDB to become healthy"
for _ in $(seq 1 90); do
  [[ "$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER" 2>/dev/null)" == "healthy" ]] && break
  sleep 2
done
[[ "$(docker inspect -f '{{.State.Health.Status}}' "$CONTAINER")" == "healthy" ]] \
  || die "MongoDB did not become healthy; check: docker logs $CONTAINER"

export MONGO_URI="mongodb://127.0.0.1:${MONGO_PORT}/?directConnection=true"

# ---------------------------------------------------------------- node packages
cd "$SCRIPT_DIR"
if [[ ! -d node_modules ]]; then
  step "Installing Node packages"
  npm ci --no-audit --no-fund >/dev/null
fi

# ---------------------------------------------------------------- collections + indexes
step "Creating collections, validators and indexes"
if [[ "$RESET" -eq 1 ]]; then node scripts/init-db.js --reset; else node scripts/init-db.js; fi

# ---------------------------------------------------------------- full sync
if [[ "$BACKFILL" -eq 1 ]]; then
  if [[ -z "${MYSQL_PWD+x}" ]]; then
    read -r -s -p "MySQL password for ${MYSQL_USER:-root}@${MYSQL_HOST:-127.0.0.1}: " MYSQL_PWD
    echo
  fi
  export MYSQL_PWD
  trap 'unset MYSQL_PWD' EXIT
  step "Embedding players and sessions from MySQL (first run downloads the model, ~90 MB)"
  node scripts/backfill.js
fi

cat <<EOF

Done. Vector store: $MONGO_URI (database pairadice_vec)
  export MONGO_URI="$MONGO_URI"
  node vector/scripts/worker.js --watch      # keep MongoDB in sync with MySQL edits
  node vector/scripts/demo-rud.js            # create / read / update / delete walkthrough
  docker exec -it $CONTAINER mongosh pairadice_vec
EOF
