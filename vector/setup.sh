#!/usr/bin/env bash
# Set up the PairADice MongoDB vector store: Atlas Local container, collections + indexes, full sync.
# Works from bash or zsh (runs under bash). Usage: ./vector/setup.sh --help
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTAINER="pairadice-mongo"
IMAGE="mongodb/mongodb-atlas-local:8.0"
MONGO_PORT="27018"            # 27017 is often taken by a Homebrew mongod
RESET=0
RECREATE=0
ROOT_USER="${MONGO_ROOT_USER:-pdRoot}"
BACKFILL=1

usage() {
  cat <<EOF
Set up the PairADice vector store (MongoDB Atlas Local in Docker, database pairadice_vec).
Run ./database/setup.sh first: the backfill reads the MySQL database.

Usage: $(basename "$0") [options]

      --port PORT       host port for MongoDB          (default: 27018, bound to 127.0.0.1 only)
      --recreate        remove the existing container AND its data volumes first (needed once to
                        switch a container that was created without authentication)
      --reset           drop the pairadice_vec database before creating it
      --no-backfill     create collections and indexes only
      --help            show this help

MongoDB runs with authentication. Passwords are read from the environment, otherwise prompted for
(input hidden): \$MONGO_ROOT_PWD (root user \$MONGO_ROOT_USER, default pdRoot), \$MONGO_API_PWD (user pdApi,
read-only), \$MONGO_WORKER_PWD (user pdWorker, read/write).

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
    --recreate)    RECREATE=1; shift ;;
    --reset)       RESET=1; shift ;;
    --no-backfill) BACKFILL=0; shift ;;
    --help)        usage; exit 0 ;;
    *)             usage >&2; die "unknown option: $1" ;;
  esac
done

command -v docker >/dev/null 2>&1 || die "docker not found. Install Docker Desktop first."
command -v node   >/dev/null 2>&1 || die "node not found. Install Node.js 20+ first."
docker info >/dev/null 2>&1       || die "the Docker daemon is not running (macOS: open -a Docker)."

# ---------------------------------------------------------------- passwords (env or hidden prompt; never on a command line)
ask_secret() {  # ask_secret VAR "label"
  if [[ -z "${!1:-}" ]]; then
    read -r -s -p "$2: " "$1"
    echo
  fi
  [[ -n "${!1}" ]] || die "$1 must not be empty"
  export "$1"
}
ask_secret MONGO_ROOT_PWD   "MongoDB root password for $ROOT_USER"
ask_secret MONGO_API_PWD    "Password to set for MongoDB user pdApi (read-only)"
ask_secret MONGO_WORKER_PWD "Password to set for MongoDB user pdWorker (read/write)"
export MONGO_INITDB_ROOT_USERNAME="$ROOT_USER"
export MONGO_INITDB_ROOT_PASSWORD="$MONGO_ROOT_PWD"

# mongo_uri USER PWD_VAR AUTHDB: credentialed URI, password URL-encoded by node from the environment
mongo_uri() {
  ENC_VAR="$2" node -e 'process.stdout.write(encodeURIComponent(process.env[process.env.ENC_VAR]))' \
    | { read -r enc; printf 'mongodb://%s:%s@127.0.0.1:%s/?directConnection=true&authSource=%s' "$1" "$enc" "$MONGO_PORT" "$3"; }
}

# ---------------------------------------------------------------- container
if [[ "$RECREATE" -eq 1 ]]; then
  step "Removing container $CONTAINER and its data volumes (--recreate)"
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker volume rm pairadice-mongo-data pairadice-mongo-config >/dev/null 2>&1 || true
fi
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
    -e MONGO_INITDB_ROOT_USERNAME -e MONGO_INITDB_ROOT_PASSWORD \
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

# A container created before auth was enforced accepts anonymous reads: refuse to continue.
if docker exec "$CONTAINER" mongosh --quiet --eval "db.getSiblingDB('pairadice_vec').getCollectionNames()" >/dev/null 2>&1; then
  die "container $CONTAINER accepts anonymous access (it was created without authentication).
  The root user can only be set when the container is first created. Recreate it, then rerun this script:
    docker rm -f $CONTAINER && docker volume rm pairadice-mongo-data pairadice-mongo-config
    ./vector/setup.sh
  (or simply: ./vector/setup.sh --recreate). The vector data is rebuilt from MySQL by the backfill."
fi

# credentialed URIs live only in the environment of the child node processes
ROOT_URI="$(mongo_uri "$ROOT_USER" MONGO_ROOT_PWD admin)"
WORKER_URI="$(mongo_uri pdWorker MONGO_WORKER_PWD pairadice_vec)"

# ---------------------------------------------------------------- node packages
cd "$SCRIPT_DIR"
if [[ ! -d node_modules ]]; then
  step "Installing Node packages"
  npm ci --no-audit --no-fund >/dev/null
fi

# ---------------------------------------------------------------- collections + indexes
step "Creating collections, validators and indexes"
if [[ "$RESET" -eq 1 ]]; then
  MONGO_ROOT_URI="$ROOT_URI" node scripts/init-db.js --reset
else
  MONGO_ROOT_URI="$ROOT_URI" node scripts/init-db.js
fi

# ---------------------------------------------------------------- full sync
if [[ "$BACKFILL" -eq 1 ]]; then
  if [[ -z "${MYSQL_PWD+x}" ]]; then
    read -r -s -p "MySQL password for ${MYSQL_USER:-root}@${MYSQL_HOST:-127.0.0.1}: " MYSQL_PWD
    echo
  fi
  export MYSQL_PWD
  trap 'unset MYSQL_PWD' EXIT
  step "Embedding players and sessions from MySQL (first run downloads the model, ~90 MB)"
  MONGO_URI="$WORKER_URI" node scripts/backfill.js
fi

cat <<EOF

Done. Vector store: 127.0.0.1:$MONGO_PORT (database pairadice_vec), authentication enforced.
Export the URI yourself (it contains a password, so this script never prints it):
  API / search (read-only):  MONGO_URI='mongodb://pdApi:***@127.0.0.1:${MONGO_PORT}/?directConnection=true&authSource=pairadice_vec'
  worker / backfill (write): MONGO_URI='mongodb://pdWorker:***@127.0.0.1:${MONGO_PORT}/?directConnection=true&authSource=pairadice_vec'
  (replace *** with the URL-encoded password)
  node vector/scripts/worker.js --watch      # keep MongoDB in sync with MySQL edits
  node vector/scripts/demo-rud.js            # create / read / update / delete walkthrough
  docker exec -it $CONTAINER mongosh pairadice_vec
EOF
