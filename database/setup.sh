#!/usr/bin/env bash
# Set up the PairADice MySQL database: schema, routines, seed data and RBAC roles.
# Works from bash or zsh (runs under bash). Usage: ./database/setup.sh --help
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DB_NAME="pairadice"
MIN_VERSION="8.0.19"          # CHECK constraints (8.0.16) + INSERT ... AS alias ON DUPLICATE KEY (8.0.19, used by 07)

MYSQL_USER="root"
MYSQL_HOST="127.0.0.1"
MYSQL_PORT="3306"
MYSQL_SOCKET=""
SEED=1
RBAC=1
VECTOR=1
RUN_TESTS=0
RUN_SAMPLES=0
ASSUME_YES=0
START_SERVER=0
APP_USER=""
WEB_USER=""
AUTH_USER=""
MOD_USER=""
ADMIN_USER=""
WORKER_USER=""
SOCKET_LOGINS_FOR=""

usage() {
  cat <<EOF
Set up the PairADice database ($DB_NAME) on a MySQL ${MIN_VERSION}+ server.

Usage: $(basename "$0") [options]

Connection:
  -u, --user USER       MySQL admin user            (default: root)
  -h, --host HOST       MySQL host                  (default: 127.0.0.1)
  -P, --port PORT       MySQL port                  (default: 3306)
  -S, --socket PATH     connect over this Unix socket instead of TCP, with no password
                        (for an auth_socket login; --host and --port are ignored)
  Over TCP the password is read from \$MYSQL_PWD if set, otherwise prompted for (input hidden).

What to load:
      --no-seed         schema + routines only, no sample data
      --no-rbac         skip the MySQL roles (needs CREATE ROLE privilege)
      --no-vector       skip the MongoDB sync triggers (07_vector_outbox.sql)
      --tests           run the constraint tests and probes afterwards (every row must PASS)
      --samples         print the sample queries afterwards
      --web-user NAME   also create a login NAME@localhost with the pairadice_web_ro role (anonymous reads)
      --auth-user NAME  ... with the pairadice_auth role (sign-up, sign-in, sessions)
      --app-user NAME   ... with the pairadice_player role (signed-in players)
      --mod-user NAME   ... with the pairadice_moderator role
      --admin-user NAME ... with the pairadice_admin role (DML + EXECUTE, no DDL)
      --worker-user NAME ... with the pairadice_vec_worker role (MongoDB sync worker and backfill)
                        Login options need RBAC and NAMEs must all differ. Each password is read from
                        \$PD_WEB_PWD, \$PD_AUTH_PWD, \$PD_APP_PWD, \$PD_MOD_PWD, \$PD_ADMIN_PWD or \$PD_WORKER_PWD when set,
                        otherwise prompted for (input hidden). Re-running resets the password.
      --socket-logins OSUSER
                        also create passwordless per-role logins for local development, mapped to
                        the operating-system user OSUSER (auth_socket): pd_web_sock, pd_auth_sock,
                        pd_player_sock, pd_mod_sock, pd_admin_sock (needs RBAC)

Other:
      --start-server    try to start a local MySQL server if it is not running
  -y, --yes             do not ask before dropping an existing $DB_NAME database
      --help            show this help

Examples:
  ./database/setup.sh
  ./database/setup.sh --tests --samples
  ./database/setup.sh -u admin -h db.local -P 3307 --no-seed
  ./database/setup.sh -y --tests --web-user pd_web --auth-user pd_auth --app-user pd_api \\
      --mod-user pd_mod --admin-user pd_admin     # passwords from PD_*_PWD env vars or prompts
  ./database/setup.sh -u my_login -S /var/run/mysqld/mysqld.sock -y --tests

Every mysql call runs with --default-character-set=utf8mb4 and time_zone='+00:00': all
DATETIME columns are UTC and the .sql files are UTF-8. Connect your own clients the same way.
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
    -S|--socket)     MYSQL_SOCKET="${2:?missing value for $1}"; shift 2 ;;
    --no-seed)       SEED=0; shift ;;
    --no-rbac)       RBAC=0; shift ;;
    --no-vector)     VECTOR=0; shift ;;
    --tests)         RUN_TESTS=1; shift ;;
    --samples)       RUN_SAMPLES=1; shift ;;
    --app-user)      APP_USER="${2:?missing value for $1}"; shift 2 ;;
    --web-user)      WEB_USER="${2:?missing value for $1}"; shift 2 ;;
    --auth-user)     AUTH_USER="${2:?missing value for $1}"; shift 2 ;;
    --mod-user)      MOD_USER="${2:?missing value for $1}"; shift 2 ;;
    --admin-user)    ADMIN_USER="${2:?missing value for $1}"; shift 2 ;;
    --worker-user)   WORKER_USER="${2:?missing value for $1}"; shift 2 ;;
    --socket-logins) SOCKET_LOGINS_FOR="${2:?missing value for $1}"; shift 2 ;;
    --start-server)  START_SERVER=1; shift ;;
    -y|--yes)        ASSUME_YES=1; shift ;;
    --help)          usage; exit 0 ;;
    *)               usage >&2; die "unknown option: $1" ;;
  esac
done

for pair in "app:$APP_USER" "web:$WEB_USER" "auth:$AUTH_USER" "mod:$MOD_USER" "admin:$ADMIN_USER" "worker:$WORKER_USER"; do
  [[ "${pair#*:}" =~ ^[A-Za-z0-9_]{1,32}$ || -z "${pair#*:}" ]] \
    || die "--${pair%%:*}-user must be 1-32 letters, digits or underscores"
done
_named=()
for n in "$APP_USER" "$WEB_USER" "$AUTH_USER" "$MOD_USER" "$ADMIN_USER" "$WORKER_USER"; do
  [[ -z "$n" ]] && continue
  for m in ${_named[@]+"${_named[@]}"}; do
    [[ "$m" != "$n" ]] || die "--app-user, --web-user, --auth-user, --mod-user, --admin-user and --worker-user must all be different logins."
  done
  _named+=("$n")
done
[[ "$SOCKET_LOGINS_FOR" =~ ^[a-z_][a-z0-9_-]{0,31}$ || -z "$SOCKET_LOGINS_FOR" ]] \
  || die "--socket-logins takes an operating-system user name"

# ---------------------------------------------------------------- prerequisites
command -v mysql >/dev/null 2>&1 \
  || die "mysql client not found. Install MySQL first (macOS: brew install mysql, Ubuntu: sudo apt install mysql-server)."

for f in 01_schema.sql 02_routines.sql 03_seed.sql 04_rbac.sql 05_sample_queries.sql 06_constraint_tests.sql 07_vector_outbox.sql 08_auth.sql 09_sessions.sql 10_social.sql 11_profiles.sql 12_moderation.sql 13_chat.sql; do
  [[ -f "$SCRIPT_DIR/$f" ]] || die "missing $SCRIPT_DIR/$f"
done

if [[ -n "$MYSQL_SOCKET" ]]; then
  MYSQL_CONN=(--protocol=SOCKET -S "$MYSQL_SOCKET")
  MYSQL_HOST="localhost"         # only used in messages from here on
else
  MYSQL_CONN=(--protocol=TCP -h "$MYSQL_HOST" -P "$MYSQL_PORT")
  if [[ -z "${MYSQL_PWD+x}" ]]; then
    read -r -s -p "MySQL password for ${MYSQL_USER}@${MYSQL_HOST}: " MYSQL_PWD
    echo
  fi
  export MYSQL_PWD               # read by the mysql client; never placed on the command line
  trap 'unset MYSQL_PWD' EXIT
fi

# utf8mb4: the .sql files are UTF-8; without it the client's latin1 default double-encodes non-ASCII text.
# time_zone UTC: every DATETIME column is UTC, so CURRENT_TIMESTAMP / NOW() writes must be made in UTC.
run_mysql() {
  mysql "${MYSQL_CONN[@]}" --default-character-set=utf8mb4 --init-command="SET time_zone='+00:00'" \
        -u "$MYSQL_USER" "$@"
}

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
load 08_auth.sql     "Creating the sign-up procedure (08_auth.sql)"
load 09_sessions.sql "Creating the session procedures (09_sessions.sql)"
load 10_social.sql   "Creating the friend and block procedures (10_social.sql)"
load 11_profiles.sql "Creating the profile-editing procedures (11_profiles.sql)"
load 12_moderation.sql "Creating the moderation procedures and expiry event (12_moderation.sql)"
load 13_chat.sql "Creating the chat, direct message and review procedures (13_chat.sql)"
if [[ "$SEED" -eq 1 ]]; then
  load 03_seed.sql   "Loading sample data (03_seed.sql)"
  # sanity check: 'Sofía' must be stored as single-encoded UTF-8 (HEX 536F66C3AD61); a double-encoded load gives 536F66C383C2AD61
  sofia_hex="$(run_mysql -N -e "SELECT HEX(display_name) FROM $DB_NAME.users WHERE username = 'sofia_bw'")"
  [[ "$sofia_hex" == "536F66C3AD61" ]] \
    || die "text was loaded double-encoded (users.sofia_bw HEX is '${sofia_hex:-<none>}', expected 536F66C3AD61). The mysql client's character set is not utf8mb4; check [client]/[mysql] default-character-set in your my.cnf, then re-run."
fi
if [[ "$RBAC" -eq 1 ]]; then
  step "Creating MySQL roles (04_rbac.sql)"
  run_mysql < "$SCRIPT_DIR/04_rbac.sql" >/dev/null \
    || die "04_rbac.sql failed. The user needs CREATE ROLE and GRANT privileges; re-run with --no-rbac to skip."
fi
if [[ "$VECTOR" -eq 1 ]]; then
  load 07_vector_outbox.sql "Creating MongoDB sync triggers (07_vector_outbox.sql)"
fi

# ---------------------------------------------------------------- optional password logins
# create_login OPTION NAME ROLE ENVVAR: the password comes from the environment variable when it is set,
# otherwise from a hidden prompt. It is passed to mysql on stdin only and never echoed.
create_login() {
  local opt="$1" name="$2" role="$3" envvar="$4" pw pw2 pw_sql
  [[ -n "$name" ]] || return 0
  [[ "$RBAC" -eq 1 ]] || die "--${opt} needs the roles from 04_rbac.sql (remove --no-rbac)."
  if [[ -n "${!envvar:-}" ]]; then
    pw="${!envvar}"
  else
    read -r -s -p "Password for MySQL login '${name}'@'localhost': " pw; echo
    read -r -s -p "Repeat password: " pw2; echo
    [[ "$pw" == "$pw2" ]] || die "passwords do not match."
  fi
  [[ -n "$pw" ]] || die "the password for '${name}' is empty."
  pw_sql="${pw//\\/\\\\}"; pw_sql="${pw_sql//\'/\'\'}"
  step "Creating login '${name}'@'localhost' with role ${role}"
  run_mysql <<SQL >/dev/null || die "could not create login ${name} (needs CREATE USER and ROLE_ADMIN)."
CREATE USER IF NOT EXISTS '${name}'@'localhost' IDENTIFIED BY '${pw_sql}';
ALTER USER '${name}'@'localhost' IDENTIFIED BY '${pw_sql}';
GRANT '${role}' TO '${name}'@'localhost';
SET DEFAULT ROLE '${role}' TO '${name}'@'localhost';
SQL
}
create_login app-user   "$APP_USER"   pairadice_player    PD_APP_PWD
create_login web-user   "$WEB_USER"   pairadice_web_ro    PD_WEB_PWD
create_login auth-user  "$AUTH_USER"  pairadice_auth      PD_AUTH_PWD
create_login mod-user   "$MOD_USER"   pairadice_moderator PD_MOD_PWD
create_login admin-user "$ADMIN_USER" pairadice_admin     PD_ADMIN_PWD
create_login worker-user "$WORKER_USER" pairadice_vec_worker PD_WORKER_PWD

# ---------------------------------------------------------------- optional local socket logins
# One passwordless login per role, so the web app can connect as a different MySQL user depending on
# who is signed in (the database enforces the roles). auth_socket only admits the given OS user.
if [[ -n "$SOCKET_LOGINS_FOR" ]]; then
  [[ "$RBAC" -eq 1 ]] || die "--socket-logins needs the roles from 04_rbac.sql (remove --no-rbac)."
  step "Creating socket logins for OS user '${SOCKET_LOGINS_FOR}'"
  for pair in pd_web_sock:pairadice_web_ro pd_auth_sock:pairadice_auth pd_player_sock:pairadice_player \
              pd_mod_sock:pairadice_moderator pd_admin_sock:pairadice_admin; do
    login="${pair%%:*}"; role="${pair##*:}"
    run_mysql <<SQL >/dev/null || die "could not create login ${login} (needs CREATE USER and ROLE_ADMIN)."
CREATE USER IF NOT EXISTS '${login}'@'localhost' IDENTIFIED WITH auth_socket AS '${SOCKET_LOGINS_FOR}';
GRANT '${role}' TO '${login}'@'localhost';
SET DEFAULT ROLE '${role}' TO '${login}'@'localhost';
SQL
    printf '    %-15s -> %s\n' "$login" "$role"
  done
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
