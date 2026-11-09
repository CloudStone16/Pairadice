// In-memory sliding-window limiter. State is PER PROCESS (a Map on globalThis,
// so dev HMR keeps it): fine for a single-instance project, not a shared limit
// across replicas. Each call to checkRateLimit counts as one attempt.

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterMs: number;
}

interface Bucket {
  hits: number[];
  windowMs: number;
}

declare global {
  var __pairadiceRateLimit: Map<string, Bucket> | undefined;
  var __pairadiceRateLimitPruned: number | undefined;
}

const PRUNE_EVERY_MS = 60_000;

function store(): Map<string, Bucket> {
  return (globalThis.__pairadiceRateLimit ??= new Map<string, Bucket>());
}

function prune(map: Map<string, Bucket>, now: number): void {
  const last = globalThis.__pairadiceRateLimitPruned ?? 0;
  if (now - last < PRUNE_EVERY_MS) return;
  globalThis.__pairadiceRateLimitPruned = now;
  for (const [key, b] of map) {
    const newest = b.hits[b.hits.length - 1];
    if (newest === undefined || newest <= now - b.windowMs) map.delete(key);
  }
}

/** Record an attempt for `key`; ok=false (with retryAfterMs) once `limit` attempts fall inside `windowMs`. */
export function checkRateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions,
  now: number = Date.now(),
): RateLimitResult {
  const map = store();
  prune(map, now);
  const bucket = map.get(key) ?? { hits: [], windowMs };
  bucket.windowMs = windowMs;
  const cutoff = now - windowMs;
  bucket.hits = bucket.hits.filter((t) => t > cutoff);
  if (bucket.hits.length >= limit) {
    map.set(key, bucket);
    const oldest = bucket.hits[0] ?? now;
    return { ok: false, retryAfterMs: Math.max(1, oldest + windowMs - now) };
  }
  bucket.hits.push(now);
  map.set(key, bucket);
  return { ok: true, retryAfterMs: 0 };
}

/** Forget a key (e.g. after a successful login). */
export function resetRateLimit(key: string): void {
  store().delete(key);
}

export const AUTH_WINDOW_MS = 15 * 60 * 1000;

export interface LimitSpec {
  key: string;
  limit: number;
  windowMs: number;
}

/**
 * Every bucket one sign-in attempt counts against: per-IP, per email+IP (brute
 * force from one place), per email alone with a high cap (stops distributed
 * guessing without letting a stranger lock the real owner out), and a global cap.
 */
export function signInLimits(ip: string, email: string): LimitSpec[] {
  return [
    { key: `signin:ip:${ip}`, limit: 20, windowMs: AUTH_WINDOW_MS },
    { key: `signin:email-ip:${email}|${ip}`, limit: 5, windowMs: AUTH_WINDOW_MS },
    { key: `signin:email:${email}`, limit: 30, windowMs: AUTH_WINDOW_MS },
    { key: "signin:global", limit: 300, windowMs: AUTH_WINDOW_MS },
  ];
}

export function signUpLimits(ip: string): LimitSpec[] {
  return [
    { key: `signup:ip:${ip}`, limit: 10, windowMs: AUTH_WINDOW_MS },
    { key: "signup:global", limit: 60, windowMs: AUTH_WINDOW_MS },
  ];
}

/** Check every bucket in order; returns the first refusal (or ok). */
export function checkAll(specs: readonly LimitSpec[], now: number = Date.now()): RateLimitResult {
  for (const { key, limit, windowMs } of specs) {
    const r = checkRateLimit(key, { limit, windowMs }, now);
    if (!r.ok) return r;
  }
  return { ok: true, retryAfterMs: 0 };
}
