// Similarity search over interest embeddings, plus the phase-B hybrid (SQL rule score + vector) ranking.
// VECTOR_MODE=atlas uses $vectorSearch; VECTOR_MODE=brute computes cosine in Node over the same filter.
import { collections, sql } from './db.js';
import { config, INDEXES } from './config.js';
import { cosine } from './embed.js';

const PROJECT = { embedding: 0 };

/** Nearest documents to `vector` in `kind` ('players' | 'sessions') that match the MongoDB `filter`. */
export async function nearest(kind, vector, { filter = {}, k = 5, project = {} } = {}) {
  const coll = (await collections())[kind];
  if (config.vectorMode === 'brute') {
    const docs = await coll.find(filter).toArray();
    return docs
      .map(({ embedding, ...d }) => ({ ...d, score: (1 + cosine(vector, embedding)) / 2 }))   // same scale as Atlas
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
  return coll.aggregate([
    {
      $vectorSearch: {
        index: INDEXES[kind], path: 'embedding', queryVector: vector,
        numCandidates: Math.max(100, k * 20), limit: k, filter,
      },
    },
    { $project: { ...PROJECT, ...project, score: { $meta: 'vectorSearchScore' } } },
  ]).toArray();
}

/**
 * $vectorSearch indexes are eventually consistent: mongot picks up writes shortly after they commit.
 * Wait until a document is (or, with present = false, is no longer) visible to vector search.
 */
export async function waitSearchable(kind, id, { present = true, timeoutMs = 10_000 } = {}) {
  if (config.vectorMode === 'brute') return;
  const probe = new Array(config.model.dims).fill(1 / Math.sqrt(config.model.dims));
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const hits = await nearest(kind, probe, { filter: { _id: id }, k: 1 });
    if ((hits.length > 0) === present) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${kind} ${id} still ${present ? 'missing from' : 'present in'} the vector index`);
}

async function playerVector(userId) {
  const doc = await (await collections()).players.findOne({ _id: userId }, { projection: { embedding: 1 } });
  if (!doc) throw new Error(`user ${userId} has no embedding (banned, missing, or not synced yet)`);
  return doc.embedding;
}

/** Players with similar interests, optionally limited to one game. */
export async function similarPlayers(userId, { gameId, k = 5 } = {}) {
  const filter = { status: 'active', _id: { $ne: userId } };
  if (gameId != null) filter.game_ids = gameId;
  return nearest('players', await playerVector(userId), { filter, k });
}

/** Open sessions whose text matches a player's interests (no hard filters: use hybridSessions for that). */
export async function similarSessions(userId, { gameId, k = 5 } = {}) {
  const filter = { status: 'open', visibility: 'public' };
  if (gameId != null) filter.game_id = gameId;
  return nearest('sessions', await playerVector(userId), { filter, k });
}

/**
 * Phase B: SQL decides eligibility and the rule score (sp_recommend_sessions), MongoDB reranks the
 * eligible sessions by interest similarity. final = w * vector + (1 - w) * rule. Optionally logged
 * to match_recommendation with source = 'hybrid'.
 */
export async function hybridSessions(userId, { k = 5, candidates = 50, log = false } = {}) {
  const db = sql();
  const [resultSets] = await db.query('CALL sp_recommend_sessions(?, ?, FALSE)', [userId, candidates]);
  const rule = resultSets[0];
  if (rule.length === 0) return [];
  const ids = rule.map((r) => Number(r.session_id));
  const sims = new Map((await nearest('sessions', await playerVector(userId),
    { filter: { _id: { $in: ids } }, k: ids.length })).map((d) => [d._id, d.score]));

  const w = config.vectorWeight;
  const ranked = rule.map((r) => {
    const vector = sims.get(Number(r.session_id)) ?? 0.5;          // not embedded yet: neutral
    const ruleScore = Number(r.score);
    return {
      session_id: Number(r.session_id), title: r.title, game: r.game,
      rule: ruleScore, vector: Number(vector.toFixed(4)),
      score: Number((w * vector + (1 - w) * ruleScore).toFixed(4)),
    };
  }).sort((a, b) => b.score - a.score).slice(0, k);

  if (log && ranked.length) {
    await db.query(
      'INSERT INTO match_recommendation (user_id, session_id, score, score_breakdown, source) VALUES ?',
      [ranked.map((r) => [userId, r.session_id, r.score,
        JSON.stringify({ rule: r.rule, vector: r.vector, vector_weight: w }), 'hybrid'])]);
  }
  return ranked;
}
