import "server-only";
import type { RowDataPacket } from "mysql2";
import { poolFor } from "@/lib/db";
import type { Viewer } from "@/lib/auth/viewer";
import { runAsViewer, type ActionResult, type WriteLogin } from "./run";

/** CALL a send procedure and read its OUT message id on the same pooled connection. */
async function callSend(login: WriteLogin, proc: string, a: number, b: number, content: string): Promise<number> {
  const conn = await poolFor(login).getConnection();
  try {
    await conn.query({ sql: `CALL ${proc}(?,?,?,@pd_message_id)`, values: [a, b, content], timeout: 15_000 });
    const [rows] = await conn.query<Array<{ mid: number | string | null } & RowDataPacket>>(
      "SELECT @pd_message_id AS mid",
    );
    const mid = Number(rows[0]?.mid);
    if (!Number.isSafeInteger(mid) || mid < 1) throw new Error(`${proc} returned no message id`);
    return mid;
  } finally {
    conn.release();
  }
}

export function sendSessionMessage(viewer: Viewer, sessionId: number, content: string): Promise<ActionResult<number>> {
  return runAsViewer(viewer, (login) => callSend(login, "sp_send_session_message", viewer.userId, sessionId, content));
}

export function sendDm(viewer: Viewer, receiverId: number, content: string): Promise<ActionResult<number>> {
  return runAsViewer(viewer, (login) => callSend(login, "sp_send_dm", viewer.userId, receiverId, content));
}

export function deleteOwnMessage(viewer: Viewer, messageId: number): Promise<ActionResult<true>> {
  return runAsViewer(viewer, async (login) => {
    await poolFor(login).query({ sql: "CALL sp_delete_own_message(?,?)", values: [viewer.userId, messageId], timeout: 15_000 });
    return true as const;
  });
}
