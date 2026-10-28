// Create the vector-store collections, validators, indexes and roles. Safe to re-run.
// Usage: node scripts/init-db.js [--reset]     (--reset drops the database first)
import { closeAll, mongo } from '../src/db.js';
import { config } from '../src/config.js';
import { DEFINITIONS, ROLES, vectorIndexDefinition } from '../src/schema.js';

const reset = process.argv.includes('--reset');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForIndex(coll, name, timeoutMs = 180_000) {
  const start = Date.now();
  for (;;) {
    const [idx] = await coll.listSearchIndexes(name).toArray();
    if (idx?.queryable && idx.status === 'READY') return idx;
    if (Date.now() - start > timeoutMs) throw new Error(`search index ${name} not ready: ${idx?.status ?? 'missing'}`);
    await sleep(1000);
  }
}

async function main() {
  const db = await mongo();
  if (reset) {
    await db.dropDatabase();
    console.log(`dropped database ${config.mongoDb}`);
  }
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));

  for (const def of DEFINITIONS) {
    if (existing.has(def.name)) {
      await db.command({ collMod: def.name, validator: def.validator, validationLevel: 'strict', validationAction: 'error' });
    } else {
      await db.createCollection(def.name, { validator: def.validator, validationLevel: 'strict', validationAction: 'error' });
    }
    const coll = db.collection(def.name);
    await coll.createIndexes(def.indexes);

    const definition = vectorIndexDefinition(def.vectorIndex.filters);
    // updateSearchIndex treats the payload as a full-text index, so a changed vector index is recreated
    const [current] = await coll.listSearchIndexes(def.vectorIndex.name).toArray();
    const same = current && JSON.stringify(current.latestDefinition) === JSON.stringify(definition);
    if (current && !same) {
      await coll.dropSearchIndex(def.vectorIndex.name);
      while ((await coll.listSearchIndexes(def.vectorIndex.name).toArray()).length) await sleep(1000);
    }
    if (!same) await coll.createSearchIndex({ name: def.vectorIndex.name, type: 'vectorSearch', definition });
    await waitForIndex(coll, def.vectorIndex.name);
    console.log(`${def.name}: validator, ${def.indexes.length} indexes, vector index ${def.vectorIndex.name} READY`);
  }

  for (const { role, privileges } of ROLES) {
    const { roles } = await db.command({ rolesInfo: role });
    await db.command(roles.length ? { updateRole: role, privileges, roles: [] } : { createRole: role, privileges, roles: [] });
  }
  console.log(`roles: ${ROLES.map((r) => r.role).join(', ')}`);
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; }).finally(closeAll);
