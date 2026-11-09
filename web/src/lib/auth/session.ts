import "server-only";
import { cookies } from "next/headers";
import { execAs, queryAs } from "../db";
import { writeLoginForRoles, type AppRole, type DbLogin } from "../db-roles";
import { hashToken, newRawToken } from "./token";

// Only the "auth" pool touches auth_token / auth_account.

export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export const SESSION_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-pd_session" : "pd_session";

export interface Session {
  userId: number;
  username: string;
  displayName: string;
  status: "active" | "suspended" | "banned";
  roles: AppRole[];
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/** Insert an auth_token row; returns the raw token (cookie value) and its expiry. */
export async function createSession(
  userId: number,
  userAgent: string | null | undefined,
): Promise<{ token: string; expiresAt: Date }> {
  const token = newRawToken();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  await execAs(
    "auth",
    "INSERT INTO auth_token (user_id, token_hash, expires_at, user_agent) VALUES (?, ?, UTC_TIMESTAMP() + INTERVAL ? SECOND, ?)",
    [userId, hashToken(token), SESSION_MAX_AGE_SECONDS, userAgent ? userAgent.slice(0, 255) : null],
  );
  return { token, expiresAt };
}

interface SessionRow {
  user_id: number | string;
  username: string;
  display_name: string;
  status: "active" | "suspended" | "banned";
  role_name: string | null;
}

/** Session for a raw cookie value, or null (unknown, revoked, expired or banned). */
export async function sessionFromToken(raw: string): Promise<Session | null> {
  const rows = await queryAs<SessionRow>(
    "auth",
    `SELECT u.user_id, u.username, u.display_name, u.status, r.role_name
       FROM auth_token t
       JOIN users u ON u.user_id = t.user_id
       LEFT JOIN user_role ur ON ur.user_id = u.user_id
       LEFT JOIN role r ON r.role_id = ur.role_id
      WHERE t.token_hash = ? AND t.revoked_at IS NULL AND t.expires_at > UTC_TIMESTAMP()
        AND u.status <> 'banned'`,
    [hashToken(raw)],
  );
  const first = rows[0];
  if (!first) return null;
  const roles: AppRole[] = [];
  for (const row of rows) {
    if (row.role_name === "player" || row.role_name === "moderator" || row.role_name === "admin") {
      if (!roles.includes(row.role_name)) roles.push(row.role_name);
    }
  }
  return {
    userId: Number(first.user_id),
    username: first.username,
    displayName: first.display_name,
    status: first.status,
    roles,
  };
}

/** Session for the current request's cookie, or null. */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  return sessionFromToken(raw);
}

export async function revokeSession(raw: string): Promise<void> {
  await execAs(
    "auth",
    "UPDATE auth_token SET revoked_at = UTC_TIMESTAMP() WHERE token_hash = ? AND revoked_at IS NULL",
    [hashToken(raw)],
  );
}

/** The MySQL login a signed-in user's writes go through; throws for suspended/banned or role-less users. */
export function writeLoginFor(session: Session): Exclude<DbLogin, "web" | "auth"> {
  if (session.status !== "active") {
    throw new Error("This account is suspended and cannot make changes.");
  }
  const login = writeLoginForRoles(session.roles);
  if (!login) throw new Error("This account has no role that allows changes.");
  return login;
}

/** For server actions: set the session cookie (call after createSession). */
export async function setSessionCookie(token: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions());
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
}
