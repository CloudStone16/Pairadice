// Pure (no server-only) so it can be unit-tested.

export type DuplicateKind = "username_taken" | "email_taken";

/**
 * Classify a MySQL duplicate-key error (errno 1062) by the exact key name in its
 * message. MySQL 8 reports keys as `table.index`. `auth_account.uq_auth_provider`
 * is deliberately NOT mapped: email accounts store provider_user_id = NULL (never
 * a duplicate), so that key can only fire for Discord rows, and it is not an
 * "email taken" condition.
 */
export function duplicateKind(err: unknown): DuplicateKind | null {
  if (typeof err !== "object" || err === null) return null;
  const e = err as { errno?: unknown; sqlMessage?: unknown };
  if (e.errno !== 1062 || typeof e.sqlMessage !== "string") return null;
  const m = /for key '([^']+)'/i.exec(e.sqlMessage);
  const key = m?.[1]?.toLowerCase();
  if (key === "users.username") return "username_taken";
  if (key === "auth_account.uq_auth_email") return "email_taken";
  return null;
}
