// Plain mapping between procedure rows and the JSON shapes in types.ts (no server-only: used by tests and
// by the client poller to check what the route handlers return).
import { CHAT_LIMITS, type ChatLine, type DmLine } from "./types";

/** "2026-11-10 12:00:00.123456" (UTC, as the pool returns it) -> ISO string; unparseable values pass through null-safe. */
export function toIso(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?(Z)?$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}T${m[2]}${(m[3] ?? "").slice(0, 4)}Z`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const truthy = (v: unknown): boolean => v === true || v === 1 || v === "1" || v === "true";

export interface ChatRowRaw {
  message_id: number | string;
  sender_id: number | string;
  username: string;
  display_name: string;
  content: string | null;
  is_deleted: unknown;
  sent_at: string | Date;
  edited_at: string | Date | null;
}

export interface DmRowRaw {
  message_id: number | string;
  sender_id: number | string;
  receiver_id: number | string;
  content: string | null;
  is_deleted: unknown;
  sent_at: string | Date;
}

export function chatLineFromRow(r: ChatRowRaw): ChatLine {
  const isDeleted = truthy(r.is_deleted);
  return {
    messageId: Number(r.message_id),
    senderId: Number(r.sender_id),
    username: r.username,
    displayName: r.display_name,
    content: isDeleted ? null : r.content,
    isDeleted,
    sentAt: toIso(r.sent_at) ?? new Date(0).toISOString(),
    editedAt: toIso(r.edited_at),
  };
}

export function dmLineFromRow(r: DmRowRaw): DmLine {
  const isDeleted = truthy(r.is_deleted);
  return {
    messageId: Number(r.message_id),
    senderId: Number(r.sender_id),
    receiverId: Number(r.receiver_id),
    content: isDeleted ? null : r.content,
    isDeleted,
    sentAt: toIso(r.sent_at) ?? new Date(0).toISOString(),
  };
}

/** Minimal shape check for the poller: both line types share these fields. */
export function isLineLike(v: unknown): v is { messageId: number; senderId: number; sentAt: string } {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    Number.isSafeInteger(o.messageId) &&
    Number.isSafeInteger(o.senderId) &&
    typeof o.sentAt === "string" &&
    (o.content === undefined || o.content === null || typeof o.content === "string")
  );
}

/** Most lines an open room keeps in memory. */
export const ROOM_MAX_LINES = 500;

/** Merge polled lines into the list by messageId (replace or insert), oldest first, keeping the newest `max`. */
export function mergeLines<T extends { messageId: number }>(prev: readonly T[], fresh: readonly T[], max = ROOM_MAX_LINES): T[] {
  const byId = new Map<number, T>();
  for (const l of prev) byId.set(l.messageId, l);
  for (const l of fresh) byId.set(l.messageId, l);
  const all = [...byId.values()].sort((a, b) => a.messageId - b.messageId);
  return all.length > max ? all.slice(all.length - max) : all;
}

/** Poll delay after `failures` consecutive errors: pollBackoffMs doubling, capped at 60 s. */
export function backoffMs(failures: number): number {
  const n = Math.max(1, Math.floor(failures));
  return Math.min(60000, CHAT_LIMITS.pollBackoffMs * 2 ** Math.min(n - 1, 10));
}
