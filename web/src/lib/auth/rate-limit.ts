import { createHash } from "node:crypto";

// In-memory failed-attempt limiter: 5 failures per key per 15 minutes. Keys are hashed so
// emails are not kept in memory. Per-process only (fine for a single server).

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

declare global {
  var __pairadiceRateLimit: Map<string, number[]> | undefined;
}

function store(): Map<string, number[]> {
  return (globalThis.__pairadiceRateLimit ??= new Map());
}

function keyOf(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function recent(k: string, now: number): number[] {
  const live = (store().get(k) ?? []).filter((t) => now - t < WINDOW_MS);
  if (live.length === 0) store().delete(k);
  else store().set(k, live);
  return live;
}

/** True once the key has recorded 5 failures within the window. */
export function isLimited(key: string): boolean {
  return recent(keyOf(key), Date.now()).length >= MAX_FAILURES;
}

export function recordFailure(key: string): void {
  const k = keyOf(key);
  const now = Date.now();
  const live = recent(k, now);
  live.push(now);
  store().set(k, live);
}

export function reset(key: string): void {
  store().delete(keyOf(key));
}
