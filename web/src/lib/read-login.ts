import "server-only";
import { getViewer, type Viewer } from "@/lib/auth/viewer";
import { readLoginForRoles, type DbLogin } from "@/lib/db-roles";

/**
 * Who a read is for. A Viewer (from getViewer) is used as given; a bare id is only honoured when it is
 * the request's own viewer; null means nobody is signed in.
 */
export type ViewerRef = Viewer | number | null | undefined;

export interface ReadCtx {
  /** The MySQL login to read through: "web" for anonymous, else the viewer's player/moderator/admin login. */
  login: Exclude<DbLogin, "auth">;
  /** The signed-in viewer's id, or null for the anonymous "web" login. */
  viewerId: number | null;
}

const ANONYMOUS: ReadCtx = { login: "web", viewerId: null };

/**
 * Resolve the login for a viewer-dependent read. Fail closed: a viewer id that does not belong to the
 * request's session (or a viewer without any role) never gets a signed-in login. Anonymous reads must
 * skip message, friendship, user_block and sp_recommend_sessions entirely.
 */
export async function readCtx(ref: ViewerRef): Promise<ReadCtx> {
  if (ref === null || ref === undefined) return ANONYMOUS;
  const viewer = typeof ref === "number" ? await getViewer() : ref;
  if (!viewer || (typeof ref === "number" && viewer.userId !== ref)) return ANONYMOUS;
  const login = readLoginForRoles(viewer.roles);
  return login === "web" ? ANONYMOUS : { login, viewerId: viewer.userId };
}
