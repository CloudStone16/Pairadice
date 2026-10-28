// Full MySQL -> MongoDB sync (every active player, every open/full/in-progress session).
// Usage: MYSQL_PWD=... node scripts/backfill.js
import { closeAll } from '../src/db.js';
import { backfill } from '../src/sync.js';

backfill()
  .then((r) => {
    for (const [entity, s] of Object.entries(r)) {
      console.log(`${entity}: ${s.embedded} embedded, ${s.refreshed} unchanged, ${s.deleted} deleted`);
    }
  })
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(closeAll);
