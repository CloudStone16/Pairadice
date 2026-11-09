// Drain embedding_outbox into MongoDB.
// Usage: node scripts/worker.js --once        process what is queued, then exit
//        node scripts/worker.js --watch       keep polling (Ctrl-C to stop)
//        add --retry-dead to first reset rows that exhausted their attempts, then carry on
import { closeAll } from '../src/db.js';
import { countDead, drainOutbox, retryDead } from '../src/sync.js';

const watch = process.argv.includes('--watch');
const POLL_MS = Number(process.env.WORKER_POLL_MS ?? 2000);
let stopping = false;
process.on('SIGINT', () => { stopping = true; });

function report(s) {
  const fmt = (x) => (x ? `${x.embedded} embedded, ${x.refreshed} refreshed, ${x.deleted} deleted` : '-');
  console.log(`${new Date().toISOString()} rows=${s.rows} player[${fmt(s.player)}] session[${fmt(s.session)}]`
    + (s.failed ? ` failed=${s.failed}` : ''));
}

let lastDead = 0;
let lastDeadLog = 0;
async function reportDead() {                              // after every cycle; an unchanged count logs at most once a minute
  const dead = await countDead();
  if (dead > 0 && (dead !== lastDead || Date.now() - lastDeadLog >= 60_000)) {
    console.log(`${new Date().toISOString()} dead=${dead}`);
    lastDeadLog = Date.now();
  }
  lastDead = dead;
}

async function main() {
  if (process.argv.includes('--retry-dead')) console.log(`retry-dead: ${await retryDead()} rows reset`);
  do {
    let s;
    do {                                                    // keep going while full batches come back
      s = await drainOutbox();
      if (s.rows) report(s);
      if (s.failed) process.exitCode = 1;                   // let scripts see failures; rows stay queued
    } while (s.rows > s.failed && !stopping);
    await reportDead();
    if (watch && !stopping) await new Promise((r) => setTimeout(r, POLL_MS));
  } while (watch && !stopping);
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; }).finally(closeAll);
