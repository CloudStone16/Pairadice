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

/**
 * Who is making this request. A real session always wins; the dev "play as" user is used only when
 * there is no session cookie at all and dev auth is enabled. One lookup per request.
 */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  const jar = await cookies();
  if (jar.get(SESSION_COOKIE)?.value) {
    const s = await getSession();
    return s ? { ...s, source: "session" } : null;
  }
  if (!isDevAuthEnabled()) return null;
  const id = parseDevUserId(jar.get(DEV_USER_COOKIE)?.value) ?? DEFAULT_DEV_USER_ID;
  const viewer = await loadDevViewer(id);
  if (viewer) return viewer;
  return id === DEFAULT_DEV_USER_ID ? null : loadDevViewer(DEFAULT_DEV_USER_ID);
});
