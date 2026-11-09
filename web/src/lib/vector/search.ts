import "server-only";
import { INDEX_NAMES, withMongo, type VectorKind } from "./mongo";

// DECISION: the web app reaches the vector store through this thin READ-ONLY MongoDB client and does
// NOT import vector/src (a separate project with heavy ML dependencies). There is no embedding model
// here: queries only reuse embeddings already stored by the sync worker (a player's own vector), so
// nothing is ever written. Behaviour mirrors vector/src/search.js (nearest, similarPlayers, blend).

export interface VectorHit {
  _id: number;
  score: number;
  [field: string]: unknown;
}

/** Nearest documents to `vector` in `kind` matching the MongoDB `filter`; the embedding is never returned. */
export async function nearest(
  kind: VectorKind,
  vector: number[],
  { filter = {}, k = 5 }: { filter?: Record<string, unknown>; k?: number } = {},
): Promise<VectorHit[]> {
  const docs = await withMongo(kind, (c) =>
    c
      .aggregate([
        {
          $vectorSearch: {
            index: INDEX_NAMES[kind],
            path: "embedding",
            queryVector: vector,
            numCandidates: Math.max(100, k * 20),
            limit: k,
            filter,
          },
        },
        { $project: { embedding: 0, score: { $meta: "vectorSearchScore" } } },
      ])
      .toArray(),
  );
  return docs as VectorHit[];
}

/** A player's stored embedding, or null when absent (banned, not synced yet). */
export async function playerVector(userId: number): Promise<number[] | null> {
  const doc = await withMongo("players", (c) => c.findOne({ _id: userId as never }, { projection: { embedding: 1 } }));
  const e = doc?.embedding as unknown;
  return Array.isArray(e) ? (e as number[]) : null;
}

/** Active players with similar interests, optionally limited to one game. No block filtering: callers must do it. */
export async function similarPlayers(
  userId: number,
  { k = 5, gameId }: { k?: number; gameId?: number } = {},
): Promise<VectorHit[]> {
  const vector = await playerVector(userId);
  if (!vector) return [];
  const filter: Record<string, unknown> = { status: "active", _id: { $ne: userId } };
  if (gameId !== undefined) filter.game_ids = gameId;
  return nearest("players", vector, { filter, k });
}

/** Open sessions' similarity to a player's interests, keyed by session id (for the hybrid rerank). */
export async function sessionSimilarities(userId: number, sessionIds: number[]): Promise<Map<number, number> | null> {
  const vector = await playerVector(userId);
  if (!vector) return null;
  const hits = await nearest("sessions", vector, { filter: { _id: { $in: sessionIds } }, k: sessionIds.length });
  return new Map(hits.map((h) => [Number(h._id), h.score]));
}

export interface Blended {
  rule: number;
  vector: number;
  vector_raw: number | null;
  score: number;
}

/**
 * final = w * vectorNorm + (1 - w) * rule. Raw similarities are min-max normalised over the candidates;
 * a candidate with no embedding, a single candidate, or max == min all get 0.5 (as vector/src/search.js).
 */
export function blend(rules: number[], raws: Array<number | undefined>, w: number): Blended[] {
  const present = raws.filter((r): r is number => r !== undefined);
  const lo = Math.min(...present);
  const hi = Math.max(...present);
  const norm = (s: number) => (present.length < 2 || hi === lo ? 0.5 : (s - lo) / (hi - lo));
  return rules.map((rule, i) => {
    const raw = raws[i];
    const v = raw === undefined ? 0.5 : norm(raw);
    return {
      rule,
      vector: Number(v.toFixed(4)),
      vector_raw: raw === undefined ? null : Number(raw.toFixed(4)),
      score: Number((w * v + (1 - w) * rule).toFixed(4)),
    };
  });
}
