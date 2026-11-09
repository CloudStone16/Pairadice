import "server-only";
import { notFound, redirect } from "next/navigation";
import type { AppRole } from "../db-roles";
import { getViewer, type Viewer } from "./viewer";

export { getViewer, type Viewer } from "./viewer";

/** admin implies moderator implies player. */
export function hasRole(viewer: Pick<Viewer, "roles">, role: AppRole): boolean {
  const r = viewer.roles;
  if (role === "player") return r.includes("player") || r.includes("moderator") || r.includes("admin");
  if (role === "moderator") return r.includes("moderator") || r.includes("admin");
  return r.includes("admin");
}

export async function requireViewer(nextPath?: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) {
    const safe = nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : null;
    redirect(safe ? `/sign-in?next=${encodeURIComponent(safe)}` : "/sign-in");
  }
  return viewer;
}

/**
 * forbidden() needs the experimental authInterrupts flag in Next 16.4, which we do not enable.
 * A viewer without the role gets notFound() (the branded "nothing here" page, status 404), so the
 * existence of staff pages is not revealed.
 */
export async function requireRole(role: AppRole, nextPath?: string): Promise<Viewer> {
  const viewer = await requireViewer(nextPath);
  if (!hasRole(viewer, role)) notFound();
  return viewer;
}
