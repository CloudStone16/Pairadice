// CONTRACT for Phase 5 chat, DMs and reviews, shared by database/13_chat.sql, the route handlers
// src/app/api/chat/** and src/app/api/dm/**, the server actions, the loaders and the UI
// (src/components/chat/**, src/components/review/**). Types and constants only: client-safe.
// Do not edit without the orchestrator.

export const CHAT_LIMITS = {
  messageMax: 1000, // characters after trimming; at least 1
  historyPage: 50, // lines per poll / initial load
  historyMax: 200, // procedures clamp p_limit to this
  rateWindowSeconds: 30,
  rateMaxMessages: 20, // per actor, across session chat and DMs
  reviewCommentMax: 500,
  pollMs: 4000,
  pollBackoffMs: 15000,
} as const;

/** Emote tokens stored as plain text in message.content; rendered as sprites at display time only. */
export const EMOTES = {
  ":gg:": "emote-gg",
  ":wave:": "emote-wave",
  ":laugh:": "emote-laugh",
  ":cheer:": "emote-cheer",
  ":sad:": "emote-sad",
  ":heart:": "emote-heart",
  ":fire:": "emote-fire",
  ":ggwp:": "emote-gg-wp",
} as const;
export type EmoteToken = keyof typeof EMOTES;

/*
 * STORED PROCEDURES (database/13_chat.sql). DEFINER, actor first, fn_user_active check, SQLSTATE 45000 with a
 * readable message on every refusal, own transaction for writes. Datetimes UTC. Created ids come back through
 * OUT params (web: transactionAs + SELECT @pd_x, as in src/lib/mutations/sessions.ts). There is NO sender id
 * parameter anywhere: the sender is always the actor.
 *
 * Writes (EXECUTE: pairadice_player; moderator inherits; admin has all):
 *   sp_send_session_message(p_actor_id, p_session_id, p_content, OUT p_message_id)
 *   sp_send_dm(p_actor_id, p_receiver_id, p_content, OUT p_message_id)
 *       DM allowed only between friends (fn_are_friends) or players who were both accepted (status accepted or
 *       left) in the same session; never across a block.
 *   sp_delete_own_message(p_actor_id, p_message_id)            soft delete (is_deleted = TRUE) of own line
 *   sp_write_review(p_actor_id, p_session_id, p_reviewed_id, p_rating, p_comment)
 *
 * Reads (same EXECUTE grants). After the change the player login has NO direct SELECT/INSERT on message.
 *   sp_chat_history(p_actor_id, p_session_id, p_after_id, p_limit)
 *       host or accepted participant only (else 45000). p_after_id NULL or 0 = the latest p_limit lines;
 *       otherwise lines with message_id > p_after_id. Always ordered oldest first. Lines from users blocked
 *       either way with the actor are omitted. Deleted lines return content NULL.
 *       columns: message_id, sender_id, username, display_name, content, is_deleted, sent_at, edited_at
 *   sp_dm_thread(p_actor_id, p_other_id, p_after_id, p_limit)
 *       same paging/order rules; empty when blocked either way.
 *       columns: message_id, sender_id, receiver_id, content, is_deleted, sent_at
 *   sp_dm_inbox(p_actor_id)
 *       one row per conversation partner (latest message), newest first; partners blocked either way omitted.
 *       columns: message_id, other_id, other_username, other_display_name, other_presence
 *                ('online' | 'away' | 'offline', same rule as presenceExpr in src/lib/sql-parts.ts),
 *                sender_id, content, is_deleted, sent_at
 *   sp_dm_can_message(p_actor_id, p_other_id)
 *       one row: can_message (0/1), reason (NULL or a readable sentence such as
 *       'You cannot message this player.' / 'You can message friends and teammates only.')
 *   sp_my_chat_status(p_actor_id)
 *       one row: account_status ('active'|'suspended'|'banned'), muted_until (DATETIME UTC or NULL)
 *   sp_pending_reviews(p_actor_id, p_session_id)
 *       teammates the actor may still review in that completed session: user_id, username, display_name
 *
 * FORM FIELD NAMES:
 *   sendSessionMessage: sessionId, content
 *   sendDm:             receiverId, content
 *   deleteOwnMessage:   messageId, back
 *   writeReview:        sessionId, reviewedId, rating ("1".."5"), comment
 *
 * ROUTE HANDLERS (GET, signed-in only, Cache-Control: no-store, JSON):
 *   /api/chat/[sessionId]?after=ID  -> { lines: ChatLine[] }      (403 JSON {error} when not a member)
 *   /api/dm/[userId]?after=ID       -> { lines: DmLine[] }
 */

export interface ChatLine {
  messageId: number;
  senderId: number;
  username: string;
  displayName: string;
  content: string | null; // null = removed
  isDeleted: boolean;
  sentAt: string; // ISO UTC
  editedAt: string | null;
}

export interface DmLine {
  messageId: number;
  senderId: number;
  receiverId: number;
  content: string | null;
  isDeleted: boolean;
  sentAt: string;
}

export interface ChatFormState {
  status: "idle" | "sent" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}
export const INITIAL_CHAT_STATE: ChatFormState = { status: "idle" };
