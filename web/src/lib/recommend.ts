import "server-only";
import { cache } from "react";
import type { Viewer } from "./auth/viewer";
import { writeLoginFor } from "./auth/session";
import { callProcAs, execAs, queryAs } from "./db";
import { readCtx } from "./read-login";
import { getQuestsByIds } from "./queries";
import type { Quest, QuestFit } from "./types";
import { blend, sessionSimilarities, type Blended } from "./vector/search";

export type RecSource = "hybrid" | "sql";
export type RecOutcome = "viewed" | "requested" | "joined";

export interface RecommendedQuest extends Quest {
  breakdown: Blended;
  /** True when the normalised vector part is high (>= SHARED_INTERESTS_AT). Hybrid only. */
  sharedInterests: boolean;
}

export interface Recommendations {
  source: RecSource;
  quests: RecommendedQuest[];
}

export const SHARED_INTERESTS_AT = 0.6;
const CANDIDATES = 50;
/** How many of the ranked rows count as "shown" (and are logged). */
const SHOWN = 5;
const LOG_WINDOW_MINUTES = 30;

interface RuleRow extends QuestFit {
  session_id: number;
  score: number;
}

interface Ranked {
  source: RecSource;
  rows: Array<{ row: RuleRow; breakdown: Blended }>;
}

let warned = false;
function warnOnce(reason: unknown): void {
  if (warned) return;
  warned = true;
  console.warn("[pairadice] vector store unavailable, using the SQL ranking:", reason instanceof Error ? reason.message : reason);
}

async function rank(viewer: Viewer): Promise<Ranked> {
  // anonymous (no role login) never calls the procedure
  const { login, viewerId } = await readCtx(viewer);
  if (viewerId === null) return { source: "sql", rows: [] };
  const rules = await callProcAs<RuleRow>(login, "CALL sp_recommend_sessions(?, ?, FALSE)", [viewerId, CANDIDATES]);
  const sqlOnly = (): Ranked => ({
    source: "sql",
    rows: rules.map((row) => ({ row, breakdown: { rule: Number(row.score), vector: 0, vector_raw: null, score: Number(row.score) } })),
  });
  if (rules.length === 0) return { source: "sql", rows: [] };

  let sims: Map<number, number> | null;
  try {
    sims = await sessionSimilarities(viewer.userId, rules.map((r) => Number(r.session_id)));
  } catch (err) {
    warnOnce(err);
    return sqlOnly();
  }
  if (!sims || sims.size === 0) {
    warnOnce("no embedding for this viewer");
    return sqlOnly();
  }
  warned = false;

  const w = Number(process.env.VECTOR_WEIGHT ?? 0.6);
  const blended = blend(
    rules.map((r) => Number(r.score)),
    rules.map((r) => sims.get(Number(r.session_id))),
    w,
  );
  const rows = rules
    .map((row, i) => ({ row, breakdown: blended[i] as Blended }))
    .sort((a, b) => b.breakdown.score - a.breakdown.score);
  return { source: "hybrid", rows };
}

/** Record what was shown, at most once per user and session id per 30 minutes. Never throws. */
async function logShown(viewer: Viewer, ranked: Ranked): Promise<void> {
  try {
    if (viewer.status !== "active") return;
    const login = writeLoginFor(viewer);
    const shown = ranked.rows.slice(0, SHOWN);
    if (shown.length === 0) return;
    const ids = shown.map((s) => Number(s.row.session_id));
    const recent = await queryAs<{ session_id: number }>(
      login,
      `SELECT DISTINCT session_id FROM match_recommendation
        WHERE user_id = ? AND shown_at > NOW() - INTERVAL ${LOG_WINDOW_MINUTES} MINUTE AND session_id IN (?)`,
      [viewer.userId, ids],
    );
    const seen = new Set(recent.map((r) => Number(r.session_id)));
    const fresh = shown.filter((s) => !seen.has(Number(s.row.session_id)));
    if (fresh.length === 0) return;
    const params: Array<string | number> = [];
    for (const { row, breakdown } of fresh) {
      params.push(
        viewer.userId,
        Number(row.session_id),
        breakdown.score.toFixed(4),
        JSON.stringify({ rule: breakdown.rule, vector: breakdown.vector, vector_raw: breakdown.vector_raw }),
        ranked.source,
      );
    }
    await execAs(
      login,
      `INSERT INTO match_recommendation (user_id, session_id, score, score_breakdown, source) VALUES ${fresh.map(() => "(?, ?, ?, ?, ?)").join(", ")}`,
      params,
    );
  } catch (err) {
    console.error("[pairadice] could not log recommendations:", err instanceof Error ? err.message : err);
  }
}

/** Rank once per request (and log once); callers slice. Keyed on the viewer object, which getViewer() caches. */
const rankedFor = cache(async (viewer: Viewer): Promise<Ranked> => {
  const ranked = await rank(viewer);
  await logShown(viewer, ranked);
  return ranked;
});

/**
 * Top `k` open quests for the viewer. SQL (sp_recommend_sessions) decides eligibility and the rule score;
 * MongoDB reranks by shared-interest similarity. Falls back to the plain SQL ranking (source "sql")
 * when the vector store is unreachable or the viewer has no embedding. Throws only if MySQL fails.
 */
export async function getHybridRecommendations(viewer: Viewer, k = SHOWN): Promise<Recommendations> {
  const ranked = await rankedFor(viewer);
  const top = ranked.rows.slice(0, k);
  const quests = await getQuestsByIds(top.map((t) => Number(t.row.session_id)), viewer);
  const byId = new Map(quests.map((q) => [q.session_id, q]));
  const out: RecommendedQuest[] = [];
  for (const { row, breakdown } of top) {
    const q = byId.get(Number(row.session_id));
    if (!q) continue;
    out.push({
      ...q,
      fit: {
        rank_fit: Number(row.rank_fit),
        avail_fit: Number(row.avail_fit),
        tag_fit: Number(row.tag_fit),
        rating_fit: Number(row.rating_fit),
        social_fit: Number(row.social_fit),
        region_fit: Number(row.region_fit),
      },
      breakdown,
      sharedInterests: ranked.source === "hybrid" && breakdown.vector >= SHARED_INTERESTS_AT,
    });
  }
  return { source: ranked.source, quests: out };
}

const OUTCOME_RANK = { ignored: 1, viewed: 2, requested: 3, joined: 4 } as const;

/**
 * Move the viewer's most recent recommendation row for this session forward to `outcome`
 * (ignored < viewed < requested < joined). Never moves backwards. Returns whether a row changed; never throws.
 */
export async function markRecommendationOutcome(
  viewer: Viewer,
  sessionId: number,
  outcome: RecOutcome,
): Promise<boolean> {
  try {
    if (viewer.status !== "active") return false;
    const login = writeLoginFor(viewer);
    const latest = await queryAs<{ rec_id: number | string }>(
      login,
      "SELECT rec_id FROM match_recommendation WHERE user_id = ? AND session_id = ? ORDER BY shown_at DESC, rec_id DESC LIMIT 1",
      [viewer.userId, sessionId],
    );
    const rec = latest[0];
    if (!rec) return false;
    const res = await execAs(
      login,
      "UPDATE match_recommendation SET outcome = ? WHERE rec_id = ? AND outcome + 0 < ?",
      [outcome, Number(rec.rec_id), OUTCOME_RANK[outcome]],
    );
    return res.affectedRows > 0;
  } catch (err) {
    console.error("[pairadice] could not record recommendation outcome:", err instanceof Error ? err.message : err);
    return false;
  }
}
