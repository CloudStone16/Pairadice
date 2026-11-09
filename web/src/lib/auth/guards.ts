import "server-only";
import { forbidden, redirect } from "next/navigation";
import { getSession, type Session } from "@/lib/auth/session";
import { roleForAppRoles, type DbRole } from "@/lib/db-roles";
import { getUserById } from "@/lib/queries";
import type { UserLite } from "@/lib/types";

export type GuardRole = "moderator" | "admin";

/** The current session or null (signed out). */
export const getViewer = getSession;

/** The viewer's public profile row (timezone, presence, trust), or null when signed out. */
export async function getViewerUser(): Promise<UserLite | null> {
  const session = await getSession();
  return session ? getUserById(session.userId, dbRoleFor(session)) : null;
}

/** `/signin?next=<path>`; only same-site absolute paths are ever passed as `next`. */
export function signInHref(nextPath: string): string {
  const safe = nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/";
  return `/signin?next=${encodeURIComponent(safe)}`;
}

/** Pure helper for UI: does the session hold this role? An admin counts as a moderator. */
export function hasRole(session: Pick<Session, "roles"> | null | undefined, role: GuardRole): boolean {
  if (!session) return false;
  if (session.roles.includes("admin")) return true;
  return role === "moderator" && session.roles.includes("moderator");
}

/** Signed in or redirect to the sign-in screen, which sends the user back to `nextPath`. */
export async function requireUser(nextPath: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(signInHref(nextPath));
  return session;
}

/** Signed in with a loadable profile row, or redirect to sign-in. Session and user are each fetched once per request. */
export async function requireViewerUser(nextPath: string): Promise<{ session: Session; user: UserLite }> {
  const session = await requireUser(nextPath);
  const user = await getUserById(session.userId, dbRoleFor(session));
  if (!user) redirect(signInHref(nextPath));
  return { session, user };
}

/** Signed out: sign in first. Signed in without the role: 403 (forbidden.tsx). */
export async function requireRole(role: GuardRole, nextPath: string = role === "admin" ? "/admin" : "/mod"): Promise<Session> {
  const session = await requireUser(nextPath);
  if (!hasRole(session, role)) forbidden();
  return session;
}

/** Signed out: sign in first. Signed in without the permission code: 403. */
export async function requirePermission(code: string, nextPath: string = "/"): Promise<Session> {
  const session = await requireUser(nextPath);
  if (!session.permissions.includes(code)) forbidden();
  return session;
}

/** Which MySQL login should act for this request. Signed out is the read-only "web" login. */
export function dbRoleFor(session: Pick<Session, "roles"> | null): DbRole {
  return session === null ? "web" : roleForAppRoles(session.roles);
}
