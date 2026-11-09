import "server-only";
import type { RowDataPacket } from "mysql2";
import { poolFor, callProcAs } from "@/lib/db";
import type { Viewer } from "@/lib/auth/viewer";
import type { ReportInput } from "@/lib/report/validate";
import type { ReportCategory } from "@/lib/moderation/types";
import { runAsViewer, type ActionResult } from "./run";

/** File a report through sp_report_user (own transaction; the OUT id is read on the same connection). */
export async function reportUser(viewer: Viewer, input: ReportInput): Promise<ActionResult<number>> {
  return runAsViewer(viewer, async (login) => {
    const conn = await poolFor(login).getConnection();
    try {
      await conn.query({
        sql: "CALL sp_report_user(?,?,?,?,?,?,@pd_report_id)",
        values: [viewer.userId, input.reportedId, input.category, input.description, input.sessionId, input.messageId],
        timeout: 15_000,
      });
      const [rows] = await conn.query<Array<{ rid: number | string | null } & RowDataPacket>>("SELECT @pd_report_id AS rid");
      const rid = Number(rows[0]?.rid);
      if (!Number.isSafeInteger(rid) || rid < 1) throw new Error("sp_report_user returned no report id");
      return rid;
    } finally {
      conn.release();
    }
  });
}

export interface MyReportRow {
  reportId: number;
  reportedUserId: number;
  reportedUsername: string;
  category: ReportCategory;
  /** The player-facing status: actioned and dismissed both read "resolved". */
  status: "open" | "reviewing" | "resolved";
  createdAt: string;
  resolvedAt: string | null;
}

interface MyReportRaw {
  report_id: number | string;
  reported_user_id: number | string;
  reported_username: string;
  category: ReportCategory;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

/** The viewer's own reports from sp_my_reports (never shows the handler or the sanction). */
export async function getMyReports(viewer: Viewer): Promise<ActionResult<MyReportRow[]>> {
  return runAsViewer(viewer, async (login) => {
    const rows = await callProcAs<MyReportRaw>(login, "CALL sp_my_reports(?)", [viewer.userId]);
    return rows.map((r) => ({
      reportId: Number(r.report_id),
      reportedUserId: Number(r.reported_user_id),
      reportedUsername: r.reported_username,
      category: r.category,
      status: r.status === "open" ? "open" : r.status === "reviewing" ? "reviewing" : "resolved",
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
    }));
  });
}
