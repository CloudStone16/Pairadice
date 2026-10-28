#!/usr/bin/env bash
# Set up the PairADice MySQL database: schema, routines, seed data and RBAC roles.
# Works from bash or zsh (runs under bash). Usage: ./database/setup.sh --help
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_NAME="pairadice"
MIN_VERSION="8.0.16"          # first MySQL release that enforces CHECK constraints

MYSQL_USER="root"
MYSQL_HOST="127.0.0.1"
MYSQL_PORT="3306"
SEED=1
RBAC=1
RUN_TESTS=0
RUN_SAMPLES=0
ASSUME_YES=0
START_SERVER=0
APP_USER=""

usage() {
  cat <<EOF
Set up the PairADice database ($DB_NAME) on a MySQL ${MIN_VERSION}+ server.

Usage: $(basename "$0") [options]

Connection:
  -u, --user USER       MySQL admin user            (default: root)
  -h, --host HOST       MySQL host                  (default: 127.0.0.1)
  -P, --port PORT       MySQL port                  (default: 3306)
  The password is read from \$MYSQL_PWD if set, otherwise prompted for (input hidden).

What to load:
      --no-seed         schema + routines only, no sample data
      --no-rbac         skip the MySQL roles (needs CREATE ROLE privilege)
      --tests           run the constraint tests afterwards (26 must-fail statements)
      --samples         print the sample queries afterwards
      --app-user NAME   also create a MySQL login NAME@localhost with the pairadice_player role

Other:
      --start-server    try to start a local MySQL server if it is not running
  -y, --yes             do not ask before dropping an existing $DB_NAME database
      --help            show this help

Examples:
  ./database/setup.sh
  ./database/setup.sh --tests --samples
  ./database/setup.sh -u admin -h db.local -P 3307 --no-seed
EOF
}

# ---------------------------------------------------------------- output helpers
if [[ -t 1 ]]; then
  C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_OFF=$'\033[0m'
else
  C_OK=""; C_WARN=""; C_ERR=""; C_DIM=""; C_OFF=""
fi
step() { printf '%s==>%s %s\n' "$C_OK" "$C_OFF" "$*"; }
warn() { printf '%swarning:%s %s\n' "$C_WARN" "$C_OFF" "$*" >&2; }
die()  { printf '%serror:%s %s\n' "$C_ERR" "$C_OFF" "$*" >&2; exit 1; }

# ---------------------------------------------------------------- arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    -u|--user)       MYSQL_USER="${2:?missing value for $1}"; shift 2 ;;
    -h|--host)       MYSQL_HOST="${2:?missing value for $1}"; shift 2 ;;
    -P|--port)       MYSQL_PORT="${2:?missing value for $1}"; shift 2 ;;
    --no-seed)       SEED=0; shift ;;
    --no-rbac)       RBAC=0; shift ;;
    --tests)         RUN_TESTS=1; shift ;;
    --samples)       RUN_SAMPLES=1; shift ;;
    --app-user)      APP_USER="${2:?missing value for $1}"; shift 2 ;;
    --start-server)  START_SERVER=1; shift ;;
    -y|--yes)        ASSUME_YES=1; shift ;;
    --help)          usage; exit 0 ;;
    *)               usage >&2; die "unknown option: $1" ;;
  esac
done

[[ "$APP_USER" =~ ^[A-Za-z0-9_]{1,32}$ || -z "$APP_USER" ]] \
  || die "--app-user must be 1-32 letters, digits or underscores"

# ---------------------------------------------------------------- prerequisites
command -v mysql >/dev/null 2>&1 \
  || die "mysql client not found. Install MySQL first (macOS: brew install mysql, Ubuntu: sudo apt install mysql-server)."

for f in 01_schema.sql 02_routines.sql 03_seed.sql 04_rbac.sql 05_sample_queries.sql 06_constraint_tests.sql; do
  [[ -f "$SCRIPT_DIR/$f" ]] || die "missing $SCRIPT_DIR/$f"
done

if [[ -z "${MYSQL_PWD+x}" ]]; then
  read -r -s -p "MySQL password for ${MYSQL_USER}@${MYSQL_HOST}: " MYSQL_PWD
  echo
fi
export MYSQL_PWD                 # read by the mysql client; never placed on the command line
trap 'unset MYSQL_PWD' EXIT

run_mysql() { mysql --protocol=TCP -u "$MYSQL_USER" -h "$MYSQL_HOST" -P "$MYSQL_PORT" "$@"; }

# ---------------------------------------------------------------- server reachable?
server_up() { run_mysql -N -e "SELECT 1" >/dev/null 2>&1; }

if ! server_up; then
  if [[ "$START_SERVER" -eq 1 ]]; then
    step "Starting the local MySQL server"
    if command -v mysql.server >/dev/null 2>&1; then
      mysql.server start >/dev/null 2>&1 &
    elif command -v systemctl >/dev/null 2>&1; then
      sudo systemctl start mysql || sudo systemctl start mysqld || true
    else
      die "don't know how to start MySQL here; start it yourself and re-run"
    fi
    for _ in $(seq 1 30); do server_up && break; sleep 1; done
  fi
  if ! server_up; then
    err="$(run_mysql -N -e "SELECT 1" 2>&1 || true)"
    case "$err" in
      *"Access denied"*) die "MySQL rejected ${MYSQL_USER}@${MYSQL_HOST}: wrong user or password." ;;
      *) die "cannot reach MySQL at ${MYSQL_HOST}:${MYSQL_PORT}. Start it (macOS: mysql.server start, Linux: sudo systemctl start mysql) or pass --start-server. ${C_DIM}(${err})${C_OFF}" ;;
    esac
  fi
fi

version="$(run_mysql -N -e "SELECT VERSION()")"
version_ge() {   # version_ge A B  ->  true when A >= B (numeric, dot-separated)
  awk -v a="${1%%-*}" -v b="$2" 'BEGIN {
    n = split(a, x, "."); split(b, y, ".")
    for (i = 1; i <= 3; i++) { if (x[i] + 0 > y[i] + 0) exit 0; if (x[i] + 0 < y[i] + 0) exit 1 }
    exit 0 }'
}
version_ge "$version" "$MIN_VERSION" || die "MySQL $version is too old; need $MIN_VERSION or newer (CHECK constraints)."
step "Connected to MySQL $version at ${MYSQL_HOST}:${MYSQL_PORT} as ${MYSQL_USER}"

# ---------------------------------------------------------------- confirm drop
exists="$(run_mysql -N -e "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name = '$DB_NAME'")"
if [[ "$exists" -eq 1 && "$ASSUME_YES" -ne 1 ]]; then
  warn "database '$DB_NAME' already exists and will be DROPPED and recreated (all its data is lost)."
  read -r -p "Continue? [y/N] " answer
  [[ "$answer" =~ ^[Yy]$ ]] || die "aborted; nothing was changed."
fi

# ---------------------------------------------------------------- load
load() {   # load FILE DESCRIPTION
  step "$2"
  if ! run_mysql < "$SCRIPT_DIR/$1" >/dev/null; then
    die "$1 failed (see the MySQL error above)."
  fi
}

load 01_schema.sql   "Creating database and tables (01_schema.sql)"
load 02_routines.sql "Creating functions, procedures, triggers and views (02_routines.sql)"
if [[ "$SEED" -eq 1 ]]; then
  load 03_seed.sql   "Loading sample data (03_seed.sql)"
fi
if [[ "$RBAC" -eq 1 ]]; then
  step "Creating MySQL roles (04_rbac.sql)"
  run_mysql < "$SCRIPT_DIR/04_rbac.sql" >/dev/null \
    || die "04_rbac.sql failed. The user needs CREATE ROLE and GRANT privileges; re-run with --no-rbac to skip."
fi

# ---------------------------------------------------------------- optional app login
if [[ -n "$APP_USER" ]]; then
  [[ "$RBAC" -eq 1 ]] || die "--app-user needs the roles from 04_rbac.sql (remove --no-rbac)."
  read -r -s -p "Password for new MySQL login '${APP_USER}'@'localhost': " app_pw; echo
  read -r -s -p "Repeat password: " app_pw2; echo
  [[ -n "$app_pw" && "$app_pw" == "$app_pw2" ]] || die "passwords are empty or do not match."
  app_pw_sql="${app_pw//\\/\\\\}"; app_pw_sql="${app_pw_sql//\'/\'\'}"
  step "Creating login '${APP_USER}'@'localhost' with role pairadice_player"
  run_mysql <<SQL >/dev/null
CREATE USER IF NOT EXISTS '${APP_USER}'@'localhost' IDENTIFIED BY '${app_pw_sql}';
GRANT 'pairadice_player' TO '${APP_USER}'@'localhost';
SET DEFAULT ROLE 'pairadice_player' TO '${APP_USER}'@'localhost';
SQL
  unset app_pw app_pw2 app_pw_sql
fi

# ---------------------------------------------------------------- tests
if [[ "$RUN_TESTS" -eq 1 ]]; then
  if [[ "$SEED" -eq 0 ]]; then
    warn "skipping tests: they need the sample data (remove --no-seed)."
  else
    step "Running constraint tests (06_constraint_tests.sql)"
    result="$(run_mysql -N < "$SCRIPT_DIR/06_constraint_tests.sql" | tail -1)"
    passed="$(printf '%s' "$result" | awk '{print $1}')"
    total="$(printf '%s' "$result" | awk '{print $2}')"
    if [[ -n "$total" && "$passed" == "$total" ]]; then
      printf '    %s%s/%s passed%s\n' "$C_OK" "$passed" "$total" "$C_OFF"
    else
      run_mysql --table < "$SCRIPT_DIR/06_constraint_tests.sql" | grep -v '| PASS ' || true
      die "constraint tests failed: ${passed:-?}/${total:-?} passed."
    fi
  fi
fi

# ---------------------------------------------------------------- summary
step "Done. Database '$DB_NAME':"
run_mysql --table -e "
SELECT
  (SELECT COUNT(*) FROM information_schema.tables   WHERE table_schema = '$DB_NAME' AND table_type = 'BASE TABLE') AS tables_,
  (SELECT COUNT(*) FROM information_schema.views    WHERE table_schema = '$DB_NAME') AS views_,
  (SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema = '$DB_NAME') AS triggers_,
  (SELECT COUNT(*) FROM information_schema.routines WHERE routine_schema = '$DB_NAME') AS routines_,
  (SELECT COUNT(*) FROM $DB_NAME.users)       AS users_,
  (SELECT COUNT(*) FROM $DB_NAME.lfg_session) AS sessions_;"

if [[ "$RUN_SAMPLES" -eq 1 ]]; then
  if [[ "$SEED" -eq 0 ]]; then
    warn "skipping sample queries: they need the sample data (remove --no-seed)."
  else
    step "Sample queries (05_sample_queries.sql)"
    run_mysql --table < "$SCRIPT_DIR/05_sample_queries.sql"
  fi
fi

cat <<EOF

Try it:
  mysql -u ${MYSQL_USER} -p ${DB_NAME} -e "SELECT * FROM v_open_sessions"
  mysql -u ${MYSQL_USER} -p ${DB_NAME} -e "CALL sp_recommend_sessions(1, 5, FALSE)"
  mysql -u ${MYSQL_USER} -p --table < ${SCRIPT_DIR}/05_sample_queries.sql
EOF
