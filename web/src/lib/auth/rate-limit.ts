import { createHash } from "node:crypto";

// In-memory limiter for the auth actions (no server-only import: unit-testable). State is per process,
// kept on globalThis so dev HMR keeps it: fine for one instance, not a shared limit across replicas.
// Keys are hashed so emails and IPs are not kept in memory, and the map is capped (oldest evicted).

export const AUTH_WINDOW_MS = 15 * 60 * 1000;
export const MAX_TRACKED_KEYS = 10_000;

export interface LimitSpec {
  key: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterMs: number;
}

declare global {
  var __pairadiceAuthLimits: Map<string, number[]> | undefined;
}

function store(): Map<string, number[]> {
  return (globalThis.__pairadiceAuthLimits ??= new Map<string, number[]>());
}

function hashed(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Insertion order is the eviction order, so a touched key moves to the back. */
function put(map: Map<string, number[]>, k: string, hits: number[], maxKeys: number): void {
  map.delete(k);
  map.set(k, hits);
  while (map.size > maxKeys) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
}

function live(map: Map<string, number[]>, k: string, windowMs: number, now: number): number[] {
  const hits = (map.get(k) ?? []).filter((t) => now - t < windowMs);
  if (hits.length === 0) map.delete(k);
  return hits;
}

/** Count one attempt on every spec; the first bucket already full refuses (and is not counted further). */
export function countAttempt(
  specs: readonly LimitSpec[],
  now: number = Date.now(),
  maxKeys: number = MAX_TRACKED_KEYS,
): RateLimitResult {
  const map = store();
  for (const { key, limit, windowMs } of specs) {
    const k = hashed(key);
    const hits = live(map, k, windowMs, now);
    if (hits.length >= limit) {
      put(map, k, hits, maxKeys);
      return { ok: false, retryAfterMs: Math.max(1, (hits[0] ?? now) + windowMs - now) };
    }
    hits.push(now);
    put(map, k, hits, maxKeys);
  }
  return { ok: true, retryAfterMs: 0 };
}

/** True once the spec's bucket holds `limit` recorded failures inside the window. Does not count. */
export function isBlocked(spec: LimitSpec, now: number = Date.now()): boolean {
  return live(store(), hashed(spec.key), spec.windowMs, now).length >= spec.limit;
}

export function recordFailure(spec: LimitSpec, now: number = Date.now(), maxKeys: number = MAX_TRACKED_KEYS): void {
  const map = store();
  const k = hashed(spec.key);
  const hits = live(map, k, spec.windowMs, now);
  hits.push(now);
  put(map, k, hits, maxKeys);
}

export function clearFailures(spec: LimitSpec): void {
  store().delete(hashed(spec.key));
}

export function trackedKeyCount(): number {
  return store().size;
}

export function resetAllLimits(): void {
  store().clear();
}

// ---- the auth buckets

/** Buckets every sign-in attempt counts against: per IP, per email alone (anti-lockout ceiling), and global. */
export function signInAttemptLimits(ip: string, email: string): LimitSpec[] {
  return [
    { key: `signin:ip:${ip}`, limit: 20, windowMs: AUTH_WINDOW_MS },
    // not tied to an IP, so a stranger cannot dodge it by changing address; it is high so it cannot lock the owner out
    { key: `signin:email:${email}`, limit: 30, windowMs: AUTH_WINDOW_MS },
    { key: "signin:global", limit: 300, windowMs: AUTH_WINDOW_MS },
  ];
}

/** Failed passwords for one email from one address: 5 per window; cleared by a successful sign-in. */
export function signInFailureLimit(ip: string, email: string): LimitSpec {
  return { key: `signin:fail:${email}|${ip}`, limit: 5, windowMs: AUTH_WINDOW_MS };
}

export function signUpLimits(ip: string): LimitSpec[] {
  return [
    { key: `signup:ip:${ip}`, limit: 10, windowMs: AUTH_WINDOW_MS },
    { key: "signup:global", limit: 60, windowMs: AUTH_WINDOW_MS },
  ];
}
