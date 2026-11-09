import "server-only";
import { getSession } from "@/lib/auth/session";
import { roleForAppRoles, type DbRole } from "@/lib/db-roles";
import { viewerOrNull } from "@/lib/sql-parts";

/**
 * The DB login for a viewer-dependent read. No viewer is always the anonymous
 * "web" login. An explicit signed-in role (from `dbRoleFor(session)`) is used as
 * given; callers that cannot pass one (shared panels) get it from the request's
 * cached session (only when it belongs to that viewer), otherwise "web".
 */
export async function resolveReadRole(viewerId: number | null, role?: DbRole): Promise<DbRole> {
  if (viewerOrNull(viewerId) === null) return "web";
  if (role !== undefined && role !== "web" && role !== "auth") return role;
  const session = await getSession();
  // Fail closed: a viewer id without a matching session never gets a signed-in login.
  return session && session.userId === viewerId ? roleForAppRoles(session.roles) : "web";
}
