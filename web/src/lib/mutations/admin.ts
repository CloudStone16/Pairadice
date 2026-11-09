import "server-only";
import { execAs } from "@/lib/db";
import type { Viewer } from "@/lib/auth/viewer";
import type { RoleName } from "@/lib/moderation/types";
import { runAsViewer, type ActionResult } from "./run";

export async function grantRole(viewer: Viewer, userId: number, role: RoleName): Promise<ActionResult> {
  return runAsViewer(viewer, async (login) => {
    await execAs(login, "CALL sp_grant_role(?,?,?)", [viewer.userId, userId, role]);
  });
}

export async function revokeRole(viewer: Viewer, userId: number, role: RoleName): Promise<ActionResult> {
  return runAsViewer(viewer, async (login) => {
    await execAs(login, "CALL sp_revoke_role(?,?,?)", [viewer.userId, userId, role]);
  });
}
