import type { Snapshot, WatchKind } from "./types";

export const POLL_MS = 2000;
export const GIVE_UP_MS = 60_000;

export const shortHash = (h: string | undefined | null): string => (h ? `${h.slice(0, 12)}\u2026` : "none");

/**
 * Has MongoDB caught up with the edit? update: the document was re-embedded or refreshed;
 * ban: the document is gone; restore / create: the document is back / has appeared.
 */
export function isDone(kind: WatchKind, before: Snapshot, now: Snapshot): boolean {
  if (now.mongoDown) return false;
  switch (kind) {
    case "ban":
      return now.doc === null;
    case "restore":
    case "create":
      return now.doc !== null;
    case "update":
      if (!now.doc) return false;
      if (!before.doc) return true;
      return now.doc.sourceHash !== before.doc.sourceHash || now.doc.updatedAt !== before.doc.updatedAt;
  }
}

/** Seconds since an ISO-ish timestamp (the outbox gives "YYYY-MM-DD HH:MM:SS.ffffff" in UTC). */
export function ageSeconds(ts: string | null, nowMs: number = Date.now()): number | null {
  if (!ts) return null;
  const iso = ts.includes("T") ? ts : `${ts.replace(" ", "T")}Z`;
  const ms = Date.parse(iso.endsWith("Z") || /[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(ms) ? null : Math.max(0, (nowMs - ms) / 1000);
}
