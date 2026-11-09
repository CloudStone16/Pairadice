import "server-only";
import { execAs } from "@/lib/db";
import type { Viewer } from "@/lib/auth/viewer";
import { runAsViewer, type ActionResult } from "./run";

// Friends and blocks. Each write is one stored procedure (database/10_social.sql); the viewer is always the
// actor, and the database decides what is allowed and words the refusal.

function call(viewer: Viewer, sql: string, params: Array<number | boolean>): Promise<ActionResult> {
  return runAsViewer(viewer, async (login) => {
    await execAs(login, sql, params);
  });
}

export const sendFriendRequest = (v: Viewer, targetId: number) =>
  call(v, "CALL sp_send_friend_request(?, ?)", [v.userId, targetId]);

export const respondFriendRequest = (v: Viewer, requesterId: number, accept: boolean) =>
  call(v, "CALL sp_respond_friend_request(?, ?, ?)", [v.userId, requesterId, accept]);

export const cancelFriendRequest = (v: Viewer, targetId: number) =>
  call(v, "CALL sp_cancel_friend_request(?, ?)", [v.userId, targetId]);

export const removeFriend = (v: Viewer, otherId: number) =>
  call(v, "CALL sp_remove_friend(?, ?)", [v.userId, otherId]);

export const blockUser = (v: Viewer, targetId: number) =>
  call(v, "CALL sp_block_user(?, ?)", [v.userId, targetId]);

export const unblockUser = (v: Viewer, targetId: number) =>
  call(v, "CALL sp_unblock_user(?, ?)", [v.userId, targetId]);
