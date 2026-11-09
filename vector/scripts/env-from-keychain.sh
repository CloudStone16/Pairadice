# Source this file (macOS only): . vector/scripts/env-from-keychain.sh
# Exports MONGO_ROOT_PWD, MONGO_API_PWD, MONGO_WORKER_PWD from the Keychain items pairadice/mongo_root,
# pairadice/mongo_api and pairadice/mongo_worker (account "pairadice"), and MONGO_URI = the pdWorker URI
# (for worker.js and backfill.js). Nothing is printed. Use a subshell if you do not want the variables to
# stay in your shell: ( . vector/scripts/env-from-keychain.sh; node vector/scripts/worker.js --once )
# Linux: there is no Keychain. Export MONGO_ROOT_PWD, MONGO_API_PWD and MONGO_WORKER_PWD yourself (for
# example from a secret manager, or via a hidden prompt: read -rs MONGO_WORKER_PWD; export MONGO_WORKER_PWD),
# then build MONGO_URI the same way: percent-encode the password with node from the environment.
_pd_kc() {  # _pd_kc item VAR
  local v
  v="$(security find-generic-password -a pairadice -s "pairadice/$1" -w 2>/dev/null)" && [ -n "$v" ] \
    && export "$2=$v" || { echo "warning: Keychain item pairadice/$1 not found" >&2; return 1; }
}
_pd_kc mongo_root MONGO_ROOT_PWD
_pd_kc mongo_api MONGO_API_PWD
if _pd_kc mongo_worker MONGO_WORKER_PWD; then
  _pd_enc="$(node -e 'process.stdout.write(encodeURIComponent(process.env.MONGO_WORKER_PWD))')"
  export MONGO_URI="mongodb://pdWorker:${_pd_enc}@127.0.0.1:${MONGO_PORT:-27018}/?directConnection=true&authSource=pairadice_vec"
  unset _pd_enc
fi
unset -f _pd_kc
