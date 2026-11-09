// Pure validators for chat and DM forms and route parameters (no server-only: unit-testable). The database
// (sp_send_session_message, sp_send_dm) stays the authority; this gives readable messages early.
import { safeNext } from "@/lib/auth/safe-next";
import { CHAT_LIMITS } from "./types";

export type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

/** A positive decimal id, or null. */
export function parseId(raw: string | null | undefined): number | null {
  const s = (raw ?? "").trim();
  if (!/^[0-9]{1,15}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Number of characters as the database counts them (code points, not UTF-16 units). */
export function charCount(text: string): number {
  return Array.from(text).length;
}

// Control characters other than tab and newline never belong in a chat line.
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** Trim, normalise line endings, and check the length and characters of one message. */
export function validateMessage(raw: string | null | undefined): Validated<string> {
  const text = (raw ?? "").replace(/\r\n?/g, "\n").trim();
  if (text === "") return { ok: false, error: "Write something first." };
  if (CONTROL.test(text)) return { ok: false, error: "That message has characters that cannot be sent." };
  const n = charCount(text);
  if (n > CHAT_LIMITS.messageMax) {
    return {
      ok: false,
      error: `Keep it to ${CHAT_LIMITS.messageMax} characters (now ${n}, ${n - CHAT_LIMITS.messageMax} too many).`,
    };
  }
  return { ok: true, value: text };
}

/** The `after` query parameter: absent or empty means "latest page" (null); anything else must be an id. */
export function parseAfter(raw: string | null | undefined): Validated<number | null> {
  if (raw === null || raw === undefined || raw.trim() === "") return { ok: true, value: null };
  const s = raw.trim();
  if (s === "0") return { ok: true, value: null };
  const id = parseId(s);
  return id === null ? { ok: false, error: "after must be a message id." } : { ok: true, value: id };
}

/** A same-site path to return to after a form post. */
export function safeBack(raw: string | null | undefined, fallback: string): string {
  return safeNext(raw, fallback);
}
