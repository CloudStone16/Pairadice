import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { queryAs } from "../db";
import type { AppRole } from "../db-roles";
import { DEFAULT_DEV_USER_ID, DEV_USER_COOKIE, isDevAuthEnabled, parseDevUserId } from "../dev-user";
import { SESSION_COOKIE, getSession } from "./session";

export interface Viewer {
  userId: number;
  username: string;
  displayName: string;
  status: "active" | "suspended" | "banned";
  roles: AppRole[];
  source: "session" | "dev";
}

interface DevUserRow {
  user_id: number | string;
  username: string;
  display_name: string;
  status: "active" | "suspended" | "banned";
}

async function loadDevViewer(id: number): Promise<Viewer | null> {
  const rows = await queryAs<DevUserRow>(
    "web",
    "SELECT user_id, username, display_name, status FROM users WHERE user_id = ?",
    [id],
  );
  const u = rows[0];
  if (!u) return null;
  const roleRows = await queryAs<{ role_name: string }>(
    "auth",
    "SELECT r.role_name FROM user_role ur JOIN role r ON r.role_id = ur.role_id WHERE ur.user_id = ?",
    [id],
  );
  const roles: AppRole[] = [];
  for (const { role_name } of roleRows) {
    if (role_name === "player" || role_name === "moderator" || role_name === "admin") roles.push(role_name);
  }
  return {
    userId: Number(u.user_id),
    username: u.username,
    displayName: u.display_name,
    status: u.status,
    roles,
    source: "dev",
  };
}

export interface ViewerState {
  viewer: Viewer | null;
  /** A session cookie was sent but it is unknown, revoked or expired. */
  sessionExpired: boolean;
}

async function devFallback(jar: Awaited<ReturnType<typeof cookies>>): Promise<Viewer | null> {
  const id = parseDevUserId(jar.get(DEV_USER_COOKIE)?.value) ?? DEFAULT_DEV_USER_ID;
  const viewer = await loadDevViewer(id);
  if (viewer) return viewer;
  return id === DEFAULT_DEV_USER_ID ? null : loadDevViewer(DEFAULT_DEV_USER_ID);
}

/**
 * Who is making this request, and whether a stale session cookie was involved. A valid session always
 * wins. With dev auth on, the dev "play as" user covers both "no cookie" and "stale cookie" (so a DB
 * reload does not lock the developer out); with it off a stale cookie yields null + sessionExpired.
 * One lookup per request.
 */
export const getViewerState = cache(async (): Promise<ViewerState> => {
  const jar = await cookies();
  const hasCookie = Boolean(jar.get(SESSION_COOKIE)?.value);
  if (hasCookie) {
    const s = await getSession();
    if (s) return { viewer: { ...s, source: "session" }, sessionExpired: false };
  }
  if (isDevAuthEnabled()) return { viewer: await devFallback(jar), sessionExpired: hasCookie };
  return { viewer: null, sessionExpired: hasCookie };
});

export async function getViewer(): Promise<Viewer | null> {
  return (await getViewerState()).viewer;
}
