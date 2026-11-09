import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { execAs, queryAs } from "@/lib/db";
import { getDevUserId, isDevAuthEnabled } from "@/lib/dev-user";
import { hashToken, isValidRawToken, newRawToken } from "@/lib/auth/token";

const SESSION_DAYS = 30;
const SESSION_MAX_AGE_S = SESSION_DAYS * 24 * 60 * 60;

export type UserStatus = "active" | "suspended" | "banned";

export interface Session {
  userId: number;
  username: string;
  displayName: string;
  status: UserStatus;
  roles: string[];
  permissions: string[];
  /** auth_token.token_id; null for the development "play as" session. */
  tokenId: number | null;
  /** true only for the dev "play as" identity (never in production). */
  dev?: true;
}

function isSecureContext(): boolean {
  return process.env.NODE_ENV === "production";
}

/** `__Host-pd_session` when Secure (production); plain `pd_session` over http in development. */
export function sessionCookieName(): string {
  return isSecureContext() ? "__Host-pd_session" : "pd_session";
}

export async function createSession(userId: number, userAgent?: string | null): Promise<void> {
  // Session fixation: any token the browser already presents is revoked before a new one is issued.
  const incoming = await readCookieToken();
  if (incoming !== null) {
    await execAs(
      "auth",
      "UPDATE auth_token SET revoked_at = UTC_TIMESTAMP() WHERE token_hash = UNHEX(?) AND revoked_at IS NULL",
      [hashToken(incoming).toString("hex")],
    );
  }
  const raw = newRawToken();
  const ua = userAgent ? userAgent.slice(0, 255) : null;
  await execAs(
    "auth",
    `INSERT INTO auth_token (user_id, token_hash, expires_at, user_agent)
     VALUES (?, UNHEX(?), UTC_TIMESTAMP() + INTERVAL ${SESSION_DAYS} DAY, ?)`,
    [userId, hashToken(raw).toString("hex"), ua],
  );
  try {
    await execAs("auth", "UPDATE users SET last_active_at = UTC_TIMESTAMP() WHERE user_id = ?", [userId]);
  } catch (err) {
    // presence is cosmetic; it must never fail a sign-in that already has a valid token
    console.error("[auth] could not update last_active_at:", err instanceof Error ? err.message : String(err));
  }
  // The cookie is set last so a failure above never leaves a cookie without a stored token.
  const jar = await cookies();
  jar.set(sessionCookieName(), raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureContext(),
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
}

interface TokenRow {
  token_id: number;
  user_id: number;
  username: string;
  display_name: string;
  status: UserStatus;
}

interface UserRow {
  user_id: number;
  username: string;
  display_name: string;
  status: UserStatus;
}

async function loadRolesAndPermissions(userId: number): Promise<{ roles: string[]; permissions: string[] }> {
  const [roleRows, permRows] = await Promise.all([
    queryAs<{ role_name: string }>(
      "auth",
      `SELECT r.role_name FROM user_role ur JOIN role r ON r.role_id = ur.role_id
       WHERE ur.user_id = ? ORDER BY r.role_name`,
      [userId],
    ),
    queryAs<{ code: string }>(
      "auth",
      `SELECT DISTINCT p.code
         FROM user_role ur
         JOIN role_permission rp ON rp.role_id = ur.role_id
         JOIN permission p ON p.permission_id = rp.permission_id
        WHERE ur.user_id = ? ORDER BY p.code`,
      [userId],
    ),
  ]);
  return { roles: roleRows.map((r) => r.role_name), permissions: permRows.map((r) => r.code) };
}

async function devSession(): Promise<Session | null> {
  if (!isDevAuthEnabled()) return null;
  const id = await getDevUserId();
  if (id === null) return null;
  const rows = await queryAs<UserRow>(
    "auth",
    "SELECT user_id, username, display_name, status FROM users WHERE user_id = ?",
    [id],
  );
  const u = rows[0];
  if (!u || u.status === "banned") return null;
  const { roles, permissions } = await loadRolesAndPermissions(u.user_id);
  return {
    userId: u.user_id,
    username: u.username,
    displayName: u.display_name,
    status: u.status,
    roles,
    permissions,
    tokenId: null,
    dev: true,
  };
}

async function readCookieToken(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(sessionCookieName())?.value;
  return isValidRawToken(raw) ? raw : null;
}

let hashFailureLogged = false;
function warnHashFailureOnce(err: unknown): void {
  if (hashFailureLogged) return;
  hashFailureLogged = true;
  console.error("[auth] session tokens cannot be verified; treating requests as signed out:", err instanceof Error ? err.message : String(err));
}

async function loadSession(): Promise<Session | null> {
  const raw = await readCookieToken();
  if (raw !== null) {
    let tokenHash: string;
    try {
      tokenHash = hashToken(raw).toString("hex");
    } catch (err) {
      // AUTH_SECRET missing/short: sessions cannot be verified. Treat as signed out instead of 500ing every page.
      warnHashFailureOnce(err);
      return devSession();
    }
    const rows = await queryAs<TokenRow>(
      "auth",
      `SELECT t.token_id, u.user_id, u.username, u.display_name, u.status
         FROM auth_token t JOIN users u ON u.user_id = t.user_id
        WHERE t.token_hash = UNHEX(?) AND t.revoked_at IS NULL AND t.expires_at > UTC_TIMESTAMP()`,
      [tokenHash],
    );
    const row = rows[0];
    if (row) {
      if (row.status === "banned") return null;
      const { roles, permissions } = await loadRolesAndPermissions(row.user_id);
      return {
        userId: row.user_id,
        username: row.username,
        displayName: row.display_name,
        status: row.status,
        roles,
        permissions,
        tokenId: row.token_id,
      };
    }
  }
  // Real sessions win; the dev cookie only applies when there is none.
  return devSession();
}

/**
 * The current session or null. Cached per request: a createSession/revokeSession
 * earlier in the same request is NOT reflected (redirect after those instead).
 */
export const getSession = cache(loadSession);

/** Revoke the current token (if any) and clear the cookie. */
export async function revokeSession(): Promise<void> {
  const raw = await readCookieToken();
  if (raw !== null) {
    await execAs(
      "auth",
      "UPDATE auth_token SET revoked_at = UTC_TIMESTAMP() WHERE token_hash = UNHEX(?) AND revoked_at IS NULL",
      [hashToken(raw).toString("hex")],
    );
  }
  const jar = await cookies();
  jar.delete(sessionCookieName());
}

/** Revoke every live token of a user (e.g. password change). Clears this browser's cookie too. */
export async function revokeAllSessions(userId: number): Promise<void> {
  await execAs(
    "auth",
    "UPDATE auth_token SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL",
    [userId],
  );
  const jar = await cookies();
  jar.delete(sessionCookieName());
}
