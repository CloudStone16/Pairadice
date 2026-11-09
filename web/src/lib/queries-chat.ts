import "server-only";
import { callProcAs } from "@/lib/db";
import { readCtx, type ViewerRef } from "@/lib/read-login";
import { CHAT_LIMITS, type ChatLine, type DmLine } from "@/lib/chat/types";
import { chatLineFromRow, dmLineFromRow, toIso, type ChatRowRaw, type DmRowRaw } from "@/lib/chat/lines";
import { bool, str } from "@/lib/sql-parts";
import type { DmPresence, DmThread } from "@/lib/types";

/** True for a database refusal (SQLSTATE 45000). */
export function isRefusal(err: unknown): err is { sqlMessage: string } {
  const e = err as { sqlState?: string; sqlMessage?: string } | null;
  return !!e && e.sqlState === "45000" && typeof e.sqlMessage === "string";
}

/** Lines of a camp chat through sp_chat_history. `after` null = latest page. Anonymous viewers get nothing. */
export async function fetchChatLines(ref: ViewerRef, sessionId: number, after: number | null): Promise<ChatLine[]> {
  const { login, viewerId } = await readCtx(ref);
  if (viewerId === null) return [];
  const rows = await callProcAs<ChatRowRaw>(login, "CALL sp_chat_history(?,?,?,?)", [
    viewerId,
    sessionId,
    after,
    CHAT_LIMITS.historyPage,
  ]);
  return rows.map(chatLineFromRow);
}

/** Lines of a DM thread through sp_dm_thread. */
export async function fetchDmLines(ref: ViewerRef, otherId: number, after: number | null): Promise<DmLine[]> {
  const { login, viewerId } = await readCtx(ref);
  if (viewerId === null) return [];
  const rows = await callProcAs<DmRowRaw>(login, "CALL sp_dm_thread(?,?,?,?)", [
    viewerId,
    otherId,
    after,
    CHAT_LIMITS.historyPage,
  ]);
  return rows.map(dmLineFromRow);
}

interface InboxRow {
  message_id: number | string;
  other_id: number | string;
  other_username: string;
  other_display_name: string;
  other_presence: string;
  sender_id: number | string;
  content: string | null;
  is_deleted: unknown;
  sent_at: string;
}

/** One row per conversation partner, newest first (sp_dm_inbox). A refusal (e.g. suspended) reads as empty. */
export async function getDmInbox(ref: ViewerRef): Promise<DmThread[]> {
  const { login, viewerId } = await readCtx(ref);
  if (viewerId === null) return [];
  let rows: InboxRow[];
  try {
    rows = await callProcAs<InboxRow>(login, "CALL sp_dm_inbox(?)", [viewerId]);
  } catch (err) {
    if (isRefusal(err)) return [];
    throw err;
  }
  return rows.map((r) => {
    const deleted = bool(r.is_deleted);
    // sp_dm_inbox reports suspended and banned partners as offline: show those as unavailable, not away
    const presence: DmPresence = r.other_presence === "online" ? "online" : r.other_presence === "offline" ? "unavailable" : "away";
    return {
      message_id: Number(r.message_id),
      other_id: Number(r.other_id),
      other_username: r.other_username,
      other_display_name: r.other_display_name,
      other_presence: presence,
      sent_by_me: Number(r.sender_id) === viewerId,
      content: deleted ? null : str(r.content),
      is_deleted: deleted,
      sent_at: r.sent_at,
    };
  });
}

export interface CanMessage {
  can: boolean;
  reason: string | null;
}

/** sp_dm_can_message. Any failure reads as "no" with a calm reason. */
export async function getCanMessage(ref: ViewerRef, otherId: number): Promise<CanMessage> {
  const { login, viewerId } = await readCtx(ref);
  if (viewerId === null) return { can: false, reason: "Sign in to send messages." };
  try {
    const rows = await callProcAs<{ can_message: unknown; reason: string | null }>(login, "CALL sp_dm_can_message(?,?)", [
      viewerId,
      otherId,
    ]);
    const r = rows[0];
    if (r && bool(r.can_message)) return { can: true, reason: null };
    return { can: false, reason: str(r?.reason) ?? "You cannot message this player." };
  } catch (err) {
    if (isRefusal(err)) return { can: false, reason: err.sqlMessage };
    console.error("[pairadice] sp_dm_can_message failed");
    return { can: false, reason: "Messages are unavailable right now." };
  }
}

export interface ChatStatus {
  /** 'active' | 'suspended' | 'banned' */
  accountStatus: string;
  /** UTC DATETIME string while muted, else null. */
  mutedUntil: string | null;
}

/** sp_my_chat_status; a refusal means the account cannot act, so it reads as suspended. */
export async function getChatStatus(ref: ViewerRef): Promise<ChatStatus> {
  const { login, viewerId } = await readCtx(ref);
  if (viewerId === null) return { accountStatus: "suspended", mutedUntil: null };
  try {
    const rows = await callProcAs<{ account_status: string; muted_until: string | Date | null }>(
      login,
      "CALL sp_my_chat_status(?)",
      [viewerId],
    );
    const r = rows[0];
    const iso = toIso(r?.muted_until ?? null);
    const until = iso && new Date(iso).getTime() > Date.now() ? iso : null;
    return { accountStatus: r?.account_status ?? "active", mutedUntil: until };
  } catch (err) {
    if (isRefusal(err)) return { accountStatus: "suspended", mutedUntil: null };
    throw err;
  }
}
