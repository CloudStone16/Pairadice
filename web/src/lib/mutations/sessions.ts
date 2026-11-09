import "server-only";
import type { RowDataPacket } from "mysql2";
import { poolFor } from "@/lib/db";
import type { Viewer } from "@/lib/auth/viewer";
import type { QuestInput } from "@/components/quest/types";
import { runAsViewer, type ActionResult } from "./run";

/**
 * Create a quest through sp_create_session. The procedure runs its own transaction, so no outer one is
 * opened here; the CALL and the SELECT of the OUT variable share one pooled connection.
 */
export async function createQuest(viewer: Viewer, input: QuestInput): Promise<ActionResult<number>> {
  return runAsViewer(viewer, async (login) => {
    const conn = await poolFor(login).getConnection();
    try {
      await conn.query({
        sql: "CALL sp_create_session(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,@pd_new_session_id)",
        values: [
          viewer.userId,
          input.gameId,
          input.modeId,
          input.platformId,
          input.regionId,
          input.title,
          input.description,
          input.maxPlayers,
          input.scheduledStartUtc,
          input.regionLocked,
          input.voiceRequired,
          input.visibility,
          input.joinPolicy,
          input.minRankId,
          input.maxRankId,
          input.minAvgRating,
          input.hostRoleId,
          input.hostAccountId,
          JSON.stringify(input.slots),
          JSON.stringify(input.languageCodes),
          JSON.stringify(input.tagIds),
        ],
        timeout: 15_000,
      });
      const [rows] = await conn.query<Array<{ sid: number | string | null } & RowDataPacket>>(
        "SELECT @pd_new_session_id AS sid",
      );
      const sid = Number(rows[0]?.sid);
      if (!Number.isSafeInteger(sid) || sid < 1) throw new Error("sp_create_session returned no session id");
      return sid;
    } finally {
      conn.release();
    }
  });
}
