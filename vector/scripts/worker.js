// Drain embedding_outbox into MongoDB.
// Usage: node scripts/worker.js --once        process what is queued, then exit
//        node scripts/worker.js --watch       keep polling (Ctrl-C to stop)
import { closeAll } from '../src/db.js';
import { drainOutbox } from '../src/sync.js';

const watch = process.argv.includes('--watch');
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 2000);
let stopping = false;
process.on('SIGINT', () => { stopping = true; });

function report(s) {
  const fmt = (x) => (x ? `${x.embedded} embedded, ${x.refreshed} refreshed, ${x.deleted} deleted` : '-');
  console.log(`${new Date().toISOString()} rows=${s.rows} player[${fmt(s.player)}] session[${fmt(s.session)}]`
    + (s.failed ? ` failed=${s.failed}` : ''));
}

async function main() {
  do {
    let s;
    do {                                                    // keep going while full batches come back
      s = await drainOutbox();
      if (s.rows) report(s);
      if (s.failed) process.exitCode = 1;                   // let scripts see failures; rows stay queued
    } while (s.rows > s.failed && !stopping);
    if (watch && !stopping) await new Promise((r) => setTimeout(r, POLL_MS));
  } while (watch && !stopping);
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; }).finally(closeAll);
