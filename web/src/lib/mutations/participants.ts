import "server-only";
import { execAs, queryAs } from "@/lib/db";
import type { Viewer } from "@/lib/auth/viewer";
import { runAsViewer, type ActionResult } from "./run";

// Camp participation writes. CALLs that return no result set go through execAs; sp_accept_participant
// ends with a SELECT, so it uses queryAs.
// Each one is a single CALL through the viewer's write login; the stored
// procedures decide whether it is allowed and raise readable messages when it is not.

export type JoinOutcome = "accepted" | "requested";
export type NextSessionStatus = "in_progress" | "cancelled" | "completed";

/** Ask to join (or join straight away when the session's join_policy is auto). */
export function requestJoin(
  viewer: Viewer,
  sessionId: number,
  roleId: number,
  accountId: number | null,
): Promise<ActionResult<JoinOutcome>> {
  return runAsViewer(viewer, async (login) => {
    await execAs(login, "CALL sp_request_join(?, ?, ?, ?)", [viewer.userId, sessionId, roleId, accountId]);
    const rows = await queryAs<{ status: string }>(
      login,
      "SELECT status FROM session_participant WHERE session_id = ? AND user_id = ?",
      [sessionId, viewer.userId],
    );
    return rows[0]?.status === "accepted" ? "accepted" : "requested";
  });
}

/** Withdraw a pending request, or leave the party when accepted. */
export function withdrawOrLeave(viewer: Viewer, sessionId: number): Promise<ActionResult> {
  return runAsViewer(viewer, async (login) => {
    await execAs(login, "CALL sp_withdraw_or_leave(?, ?)", [viewer.userId, sessionId]);
  });
}

/** Note the argument order of sp_accept_participant: (session, player, actor). */
export function acceptPlayer(viewer: Viewer, sessionId: number, userId: number): Promise<ActionResult> {
  return runAsViewer(viewer, async (login) => {
    await queryAs(login, "CALL sp_accept_participant(?, ?, ?)", [sessionId, userId, viewer.userId]);
  });
}

export function declinePlayer(viewer: Viewer, sessionId: number, userId: number): Promise<ActionResult> {
  return runAsViewer(viewer, async (login) => {
    await execAs(login, "CALL sp_decline_participant(?, ?, ?)", [viewer.userId, sessionId, userId]);
  });
}

export function kickPlayer(viewer: Viewer, sessionId: number, userId: number): Promise<ActionResult> {
  return runAsViewer(viewer, async (login) => {
    await execAs(login, "CALL sp_kick_participant(?, ?, ?)", [viewer.userId, sessionId, userId]);
  });
}

export function setSessionStatus(
  viewer: Viewer,
  sessionId: number,
  status: NextSessionStatus,
): Promise<ActionResult> {
  return runAsViewer(viewer, async (login) => {
    await execAs(login, "CALL sp_set_session_status(?, ?, ?)", [viewer.userId, sessionId, status]);
  });
}
