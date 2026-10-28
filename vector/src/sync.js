// MySQL -> MongoDB sync: upsert / re-embed / delete embedding documents, and drain embedding_outbox.
import { collections, sql } from './db.js';
import { config } from './config.js';
import { embed } from './embed.js';
import { hashText, loadPlayers, loadSessions } from './sourceText.js';

const LOADERS = { player: loadPlayers, session: loadSessions };
const COLL = { player: 'players', session: 'sessions' };

/**
 * Bring the MongoDB documents for these ids in line with MySQL.
 * - row gone / banned / closed  -> delete the document
 * - text unchanged (same hash)  -> refresh filter fields only, no re-embed
 * - text changed or new         -> embed and replace the document
 */
export async function syncEntities(entity, ids) {
  const stats = { embedded: 0, refreshed: 0, deleted: 0 };
  if (ids.length === 0) return stats;
  const coll = (await collections())[COLL[entity]];
  const sources = await LOADERS[entity](ids);

  const gone = ids.filter((id) => !sources.has(id));
  if (gone.length) stats.deleted = (await coll.deleteMany({ _id: { $in: gone } })).deletedCount;

  const present = [...sources.keys()];
  const existing = new Map(
    (await coll.find({ _id: { $in: present } }, { projection: { source_hash: 1 } }).toArray())
      .map((d) => [d._id, d.source_hash]));

  const now = new Date();
  const toEmbed = [];
  const ops = [];
  for (const [id, { text, fields }] of sources) {
    const hash = hashText(text);
    if (existing.get(id) === hash) {
      ops.push({ updateOne: { filter: { _id: id }, update: { $set: { ...fields, updated_at: now } } } });
      stats.refreshed++;
    } else {
      toEmbed.push({ id, text, hash, fields });
    }
  }
  if (toEmbed.length) {
    const vectors = await embed(toEmbed.map((x) => x.text));
    toEmbed.forEach((x, i) => ops.push({
      replaceOne: {
        filter: { _id: x.id },
        replacement: {
          ...x.fields,
          embedding: vectors[i],
          source_text: x.text,
          source_hash: x.hash,
          model: { name: config.model.name, dims: config.model.dims },
          embedded_at: now,
          updated_at: now,
        },
        upsert: true,
      },
    }));
    stats.embedded = toEmbed.length;
  }
  if (ops.length) await coll.bulkWrite(ops, { ordered: false });
  return stats;
}

/** Full rebuild: sync every eligible row and remove documents MySQL no longer has. */
export async function backfill() {
  const result = {};
  for (const entity of ['player', 'session']) {
    const ids = [...(await LOADERS[entity]()).keys()];
    const stats = await syncEntities(entity, ids);
    const coll = (await collections())[COLL[entity]];
    stats.deleted += (await coll.deleteMany({ _id: { $nin: ids } })).deletedCount;
    result[entity] = stats;
  }
  return result;
}

const MAX_ATTEMPTS = 5;

/**
 * Process up to `limit` outbox rows (oldest first). A row is removed only if its enqueued_at is
 * unchanged, so an edit that lands while the batch is being embedded is picked up next time.
 */
export async function drainOutbox({ limit = 100 } = {}) {
  const db = sql();
  const [rows] = await db.query(
    `SELECT entity, entity_id, op, enqueued_at FROM embedding_outbox
      WHERE attempts < ? ORDER BY enqueued_at LIMIT ?`, [MAX_ATTEMPTS, limit]);
  const summary = { rows: rows.length, player: null, session: null, failed: 0 };
  for (const entity of ['player', 'session']) {
    const batch = rows.filter((r) => r.entity === entity);
    if (batch.length === 0) continue;
    const done = (r) => db.query('DELETE FROM embedding_outbox WHERE entity = ? AND entity_id = ? AND enqueued_at = ?',
      [r.entity, r.entity_id, r.enqueued_at]);
    try {
      // a 'delete' row is a hint; syncEntities re-reads MySQL and deletes whatever is no longer eligible
      summary[entity] = await syncEntities(entity, batch.map((r) => Number(r.entity_id)));
      for (const r of batch) await done(r);
    } catch {
      // retry one by one, so only rows that fail on their own use up an attempt (one bad document
      // does not strand the whole batch); if MongoDB or MySQL is down, every row fails and is retried later
      const stats = { embedded: 0, refreshed: 0, deleted: 0 };
      for (const r of batch) {
        try {
          const s = await syncEntities(entity, [Number(r.entity_id)]);
          for (const k of Object.keys(stats)) stats[k] += s[k];
          await done(r);
        } catch (err) {
          summary.failed++;
          await db.query(
            `UPDATE embedding_outbox SET attempts = attempts + 1, last_error = ?
              WHERE entity = ? AND entity_id = ? AND enqueued_at = ?`,
            [String(err.message).slice(0, 255), r.entity, r.entity_id, r.enqueued_at]).catch(() => {});
        }
      }
      summary[entity] = stats;
    }
  }
  return summary;
}
