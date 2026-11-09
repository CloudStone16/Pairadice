import "server-only";
import type { DbLogin } from "@/lib/db-roles";
import { writeLoginFor } from "@/lib/auth/session";
import type { Viewer } from "@/lib/auth/viewer";

// Shared plumbing for writes. A write runs through the MySQL login of the viewer's highest role
// (player / moderator / admin), so the database's own grants decide what is allowed. Business rules
// live in stored procedures and triggers, which raise SQLSTATE 45000 with a readable message.

export type WriteLogin = Exclude<DbLogin, "web" | "auth">;

export type ActionResult<T = void> = { ok: true; value: T } | { ok: false; message: string };

const GENERIC = "Something went wrong, please try again.";

interface MysqlError {
  code?: string;
  sqlState?: string;
  sqlMessage?: string;
}

/** A message safe to show the user, or null when the error is unexpected. */
export function friendlyDbError(err: unknown): string | null {
  const e = (err ?? {}) as MysqlError;
  if (e.sqlState === "45000" && e.sqlMessage) return e.sqlMessage;
  switch (e.code) {
    case "ER_DUP_ENTRY":
      return "That already exists.";
    case "ER_CHECK_CONSTRAINT_VIOLATED":
      return "One of those values is not allowed.";
    case "ER_NO_REFERENCED_ROW_2":
      return "One of those choices no longer exists.";
    case "ER_TABLEACCESS_DENIED_ERROR":
    case "ER_COLUMNACCESS_DENIED_ERROR":
    case "ER_PROCACCESS_DENIED_ERROR":
      return "Your role is not allowed to do that.";
    default:
      return null;
  }
}

/**
 * Run `fn` with the viewer's write login. Suspended or role-less viewers get a message, not an exception;
 * database errors become friendly messages, and anything unexpected is logged and reported generically.
 */
export async function runAsViewer<T>(
  viewer: Viewer | null,
  fn: (login: WriteLogin) => Promise<T>,
): Promise<ActionResult<T>> {
  if (!viewer) return { ok: false, message: "Sign in first." };
  let login: WriteLogin;
  try {
    login = writeLoginFor(viewer);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : GENERIC };
  }
  try {
    return { ok: true, value: await fn(login) };
  } catch (err) {
    const message = friendlyDbError(err);
    if (message === null) console.error("[pairadice] write failed:", err);
    return { ok: false, message: message ?? GENERIC };
  }
}
