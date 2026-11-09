// Pure time helpers for the moderation screens (no clock access: callers pass `nowMs`).

/** "in 2 d 4 h", "in 35 min", "3 d ago", "just now". `iso` is an ISO UTC string. */
export function formatRelative(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = t - nowMs;
  const abs = Math.abs(diff);
  if (abs < 60_000) return "just now";
  const min = Math.floor(abs / 60_000);
  const hours = Math.floor(min / 60);
  const days = Math.floor(hours / 24);
  let text: string;
  if (days >= 1) text = hours % 24 > 0 && days < 10 ? `${days} d ${hours % 24} h` : `${days} d`;
  else if (hours >= 1) text = min % 60 > 0 ? `${hours} h ${min % 60} min` : `${hours} h`;
  else text = `${min} min`;
  return diff > 0 ? `in ${text}` : `${text} ago`;
}

/** Age of a report for the queue: "2 d 3 h", "45 min". */
export function formatAge(iso: string, nowMs: number): string {
  const rel = formatRelative(iso, nowMs);
  return rel === "just now" ? "under a minute" : rel.replace(/ ago$/, "");
}

/** MySQL "YYYY-MM-DD HH:MM:SS" (UTC) or ISO -> ISO with Z; null stays null. */
export function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value);
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(s);
  return m ? `${m[1]}T${m[2]}Z` : null;
}

/** The current time in ms; a function so pages do not read the clock inline while rendering. */
export function nowMs(): number {
  return Date.now();
}
