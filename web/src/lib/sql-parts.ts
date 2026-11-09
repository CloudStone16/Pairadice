// Constant SQL fragments shared by the read-only query modules.
// Fragments never contain values; every value goes through `?` placeholders.

const ALIAS = /^[a-z_][a-z0-9_]*$/i;

function safeAlias(alias: string): string {
  if (!ALIAS.test(alias)) throw new Error(`Invalid SQL alias: ${alias}`);
  return alias;
}

/**
 * The single definition of "presence" for a `users` row. Connections run in
 * UTC (see db.ts), so it compares against UTC_TIMESTAMP().
 */
export function presenceExpr(alias: string): string {
  const a = safeAlias(alias);
  return `CASE WHEN ${a}.status IN ('suspended','banned') THEN 'suspended'
       WHEN ${a}.last_active_at >= UTC_TIMESTAMP() - INTERVAL 15 MINUTE THEN 'online'
       ELSE 'away' END`;
}

/** Columns of `users` (alias u) that the web app may read. No auth/PII columns. */
export const USER_COLS = `u.user_id, u.username, u.display_name, u.timezone, u.trust_score,
  ${presenceExpr("u")} AS presence`;

/** A SQL fragment plus the values for its `?` placeholders (in order). */
export interface SqlFragment {
  sql: string;
  params: number[];
}

/**
 * Normalise a viewer id: a positive safe integer, else null ("no viewer").
 * The anonymous "web" login must never run viewer-specific clauses, which read
 * friendship / user_block / message tables it has no grants on.
 */
export function viewerOrNull(viewerId: number | null | undefined): number | null {
  return typeof viewerId === "number" && Number.isSafeInteger(viewerId) && viewerId > 0 ? viewerId : null;
}

/**
 * Session visibility for a viewer. Expects the lfg_session alias `s` in scope.
 * No viewer: public sessions only (no friendship lookup, no placeholders).
 * Viewer: 3 placeholders (all = viewer id).
 */
export function visibleToViewer(viewerId: number | null): SqlFragment {
  const v = viewerOrNull(viewerId);
  if (v === null) return { sql: `(s.visibility = 'public')`, params: [] };
  return {
    sql: `(s.visibility = 'public' OR s.host_id = ?
  OR (s.visibility = 'friends' AND EXISTS (
        SELECT 1 FROM friendship f
         WHERE f.status = 'accepted'
           AND f.pair_low = LEAST(?, s.host_id) AND f.pair_high = GREATEST(?, s.host_id))))`,
    params: [v, v, v],
  };
}

/**
 * Whether a viewer may open a camp page: visible to them, or they are in the
 * roster (accepted / requested), which is how invite-only camps reach their
 * guests. Expects alias `s`. No viewer: public camps only. Viewer: 4 placeholders.
 */
export function canViewCamp(viewerId: number | null): SqlFragment {
  const v = viewerOrNull(viewerId);
  if (v === null) return visibleToViewer(null);
  const vis = visibleToViewer(v);
  return {
    sql: `(${vis.sql}
  OR EXISTS (SELECT 1 FROM v_session_roster rv
              WHERE rv.session_id = s.session_id AND rv.user_id = ?
                AND rv.status IN ('accepted', 'requested')))`,
    params: [...vis.params, v],
  };
}

/**
 * Excludes users blocked in either direction (2 placeholders, both = viewer id).
 * `alias` is the users alias of the OTHER person. Only for signed-in viewers:
 * with no viewer there is nothing to filter, so callers must not call this.
 */
export function notBlockedWith(alias: string, viewerId: number): SqlFragment {
  const a = safeAlias(alias);
  return {
    sql: `NOT EXISTS (SELECT 1 FROM user_block ub
          WHERE (ub.blocker_id = ? AND ub.blocked_id = ${a}.user_id)
             OR (ub.blocker_id = ${a}.user_id AND ub.blocked_id = ?))`,
    params: [viewerId, viewerId],
  };
}

/** Past-dated quests older than a day drop off the board (no placeholders). Expects alias `s`. */
export const NOT_LONG_PAST = `(s.scheduled_start IS NULL OR s.scheduled_start >= UTC_TIMESTAMP() - INTERVAL 1 DAY)`;

/** Coerce driver values (string | Buffer | null) to string | null. */
export function str(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

/** MySQL TINYINT(1) / BOOLEAN to boolean. */
export function bool(value: unknown): boolean {
  return value === true || Number(value) === 1;
}
