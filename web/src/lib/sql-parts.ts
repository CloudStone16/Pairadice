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

/**
 * Session visibility for a viewer (3 placeholders, all = viewer id).
 * Expects the lfg_session alias `s` in scope.
 */
export const VISIBLE_TO_VIEWER = `(s.visibility = 'public' OR s.host_id = ?
  OR (s.visibility = 'friends' AND EXISTS (
        SELECT 1 FROM friendship f
         WHERE f.status = 'accepted'
           AND f.pair_low = LEAST(?, s.host_id) AND f.pair_high = GREATEST(?, s.host_id))))`;

/**
 * Whether a viewer may open a camp page (4 placeholders, all = viewer id):
 * visible to them, or they are in the roster (accepted / requested), which is
 * how invite-only camps reach their guests. Expects alias `s`.
 */
export const CAN_VIEW_CAMP = `(${VISIBLE_TO_VIEWER}
  OR EXISTS (SELECT 1 FROM v_session_roster rv
              WHERE rv.session_id = s.session_id AND rv.user_id = ?
                AND rv.status IN ('accepted', 'requested')))`;

/**
 * Excludes users blocked in either direction (2 placeholders, both = viewer id).
 * `alias` is the users alias of the OTHER person.
 */
export function notBlockedWith(alias: string): string {
  const a = safeAlias(alias);
  return `NOT EXISTS (SELECT 1 FROM user_block ub
          WHERE (ub.blocker_id = ? AND ub.blocked_id = ${a}.user_id)
             OR (ub.blocker_id = ${a}.user_id AND ub.blocked_id = ?))`;
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
