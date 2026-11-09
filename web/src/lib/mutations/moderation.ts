import "server-only";
import type { RowDataPacket } from "mysql2";
import { execAs, poolFor } from "@/lib/db";
import type { Viewer } from "@/lib/auth/viewer";
import type { SanctionType } from "@/lib/moderation/types";
import { runAsViewer, type ActionResult } from "./run";

// Moderation writes. Each is one stored procedure (database/12_moderation.sql); the viewer is always the
// actor, and the database decides what is allowed and words the refusal.

export const claimReport = (v: Viewer, reportId: number): Promise<ActionResult> =>
  runAsViewer(v, async (login) => {
    await execAs(login, "CALL sp_claim_report(?, ?)", [v.userId, reportId]);
  });

export const resolveReport = (
  v: Viewer,
  reportId: number,
  outcome: "dismissed" | "actioned",
  note: string | null,
): Promise<ActionResult> =>
  runAsViewer(v, async (login) => {
    await execAs(login, "CALL sp_resolve_report(?, ?, ?, ?)", [v.userId, reportId, outcome, note]);
  });

export interface SanctionCall {
  userId: number;
  type: SanctionType;
  reason: string;
  /** UTC 'YYYY-MM-DD HH:MM:SS' or null (warn, ban) */
  endsAt: string | null;
  reportId: number | null;
}

/** Issue a sanction; resolves to the new sanction_id (OUT parameter, read on the same connection). */
export function issueSanction(v: Viewer, s: SanctionCall): Promise<ActionResult<number>> {
  return runAsViewer(v, async (login) => {
    const conn = await poolFor(login).getConnection();
    try {
      await conn.query({
        sql: "CALL sp_issue_sanction(?,?,?,?,?,?,@pd_sanction_id)",
        values: [v.userId, s.userId, s.type, s.reason, s.endsAt, s.reportId],
        timeout: 15_000,
      });
      const [rows] = await conn.query<Array<{ sid: number | string | null } & RowDataPacket>>("SELECT @pd_sanction_id AS sid");
      const sid = Number(rows[0]?.sid);
      if (!Number.isSafeInteger(sid) || sid < 1) throw new Error("sp_issue_sanction returned no sanction id");
      return sid;
    } finally {
      conn.release();
    }
  });
}

export const liftSanction = (v: Viewer, sanctionId: number, reason: string): Promise<ActionResult> =>
  runAsViewer(v, async (login) => {
    await execAs(login, "CALL sp_lift_sanction(?, ?, ?)", [v.userId, sanctionId, reason]);
  });

export const moderateMessage = (
  v: Viewer,
  messageId: number,
  hide: boolean,
  reportId: number | null,
): Promise<ActionResult> =>
  runAsViewer(v, async (login) => {
    await execAs(login, "CALL sp_moderate_message(?, ?, ?, ?)", [v.userId, messageId, hide, reportId]);
  });

/** sp_expire_sanctions may or may not return a result set, so the result shape is not inspected. */
export const expireSanctions = (v: Viewer): Promise<ActionResult> =>
  runAsViewer(v, async (login) => {
    await poolFor(login).query({ sql: "CALL sp_expire_sanctions()", timeout: 15_000 });
  });
