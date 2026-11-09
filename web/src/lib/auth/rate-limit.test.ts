import { beforeEach, describe, expect, test } from "bun:test";
import {
  AUTH_WINDOW_MS,
  clearFailures,
  countAttempt,
  isBlocked,
  recordFailure,
  resetAllLimits,
  signInAttemptLimits,
  signInFailureLimit,
  signUpLimits,
  trackedKeyCount,
} from "./rate-limit";

beforeEach(() => resetAllLimits());

describe("limit specs", () => {
  test("sign-in buckets and ceilings", () => {
    const specs = signInAttemptLimits("1.2.3.4", "a@example.com");
    expect(specs.map((s) => [s.key, s.limit])).toEqual([
      ["signin:ip:1.2.3.4", 20],
      ["signin:email:a@example.com", 30],
      ["signin:global", 300],
    ]);
    expect(signInFailureLimit("1.2.3.4", "a@example.com").limit).toBe(5);
    expect(specs.every((s) => s.windowMs === AUTH_WINDOW_MS)).toBe(true);
  });
  test("the per-email ceiling does not depend on the IP", () => {
    const a = signInAttemptLimits("1.1.1.1", "a@example.com")[1]?.key;
    const b = signInAttemptLimits("2.2.2.2", "a@example.com")[1]?.key;
    expect(a).toBe(b);
    expect(signInFailureLimit("1.1.1.1", "a@example.com").key).not.toBe(signInFailureLimit("2.2.2.2", "a@example.com").key);
  });
  test("sign-up buckets", () => {
    expect(signUpLimits("9.9.9.9").map((s) => [s.key, s.limit])).toEqual([
      ["signup:ip:9.9.9.9", 10],
      ["signup:global", 60],
    ]);
  });
});

describe("failure bucket", () => {
  test("blocks after 5 failures, clears on success", () => {
    const spec = signInFailureLimit("1.2.3.4", "a@example.com");
    for (let i = 0; i < 5; i++) {
      expect(isBlocked(spec)).toBe(false);
      recordFailure(spec);
    }
    expect(isBlocked(spec)).toBe(true);
    clearFailures(spec);
    expect(isBlocked(spec)).toBe(false);
  });
  test("failures expire after the window", () => {
    const spec = signInFailureLimit("1.2.3.4", "a@example.com");
    for (let i = 0; i < 5; i++) recordFailure(spec, 1000);
    expect(isBlocked(spec, 1000 + AUTH_WINDOW_MS - 1)).toBe(true);
    expect(isBlocked(spec, 1000 + AUTH_WINDOW_MS)).toBe(false);
  });
});

describe("attempt buckets", () => {
  test("per-IP sign-in cap is 20 per window", () => {
    for (let i = 0; i < 20; i++) expect(countAttempt(signInAttemptLimits("1.2.3.4", `u${i}@example.com`), 5000).ok).toBe(true);
    const r = countAttempt(signInAttemptLimits("1.2.3.4", "other@example.com"), 5000);
    expect(r.ok).toBe(false);
    expect(r.retryAfterMs).toBeGreaterThan(0);
    // another address is unaffected
    expect(countAttempt(signInAttemptLimits("5.6.7.8", "other@example.com"), 5000).ok).toBe(true);
  });
  test("per-email cap holds when the IP changes", () => {
    for (let i = 0; i < 30; i++) expect(countAttempt(signInAttemptLimits(`10.0.0.${i % 250}`, "victim@example.com"), 5000).ok).toBe(true);
    expect(countAttempt(signInAttemptLimits("77.7.7.7", "victim@example.com"), 5000).ok).toBe(false);
  });
  test("sign-up cap is 10 per IP", () => {
    for (let i = 0; i < 10; i++) expect(countAttempt(signUpLimits("3.3.3.3"), 100).ok).toBe(true);
    expect(countAttempt(signUpLimits("3.3.3.3"), 100).ok).toBe(false);
    expect(countAttempt(signUpLimits("3.3.3.3"), 100 + AUTH_WINDOW_MS).ok).toBe(true);
  });
  test("global sign-up cap is 60 per window", () => {
    for (let i = 0; i < 60; i++) expect(countAttempt(signUpLimits(`ip${i}`), 100).ok).toBe(true);
    expect(countAttempt(signUpLimits("fresh"), 100).ok).toBe(false);
  });
});

describe("eviction", () => {
  test("the map is capped and the oldest key goes first", () => {
    const cap = 5;
    for (let i = 0; i < 8; i++) countAttempt([{ key: `k${i}`, limit: 1, windowMs: AUTH_WINDOW_MS }], 1000 + i, cap);
    expect(trackedKeyCount()).toBe(cap);
    // k0 was evicted, so it is allowed again; k7 is still full
    expect(countAttempt([{ key: "k0", limit: 1, windowMs: AUTH_WINDOW_MS }], 2000, cap).ok).toBe(true);
    expect(countAttempt([{ key: "k7", limit: 1, windowMs: AUTH_WINDOW_MS }], 2000, cap).ok).toBe(false);
  });
  test("recordFailure also respects the cap", () => {
    for (let i = 0; i < 9; i++) recordFailure({ key: `f${i}`, limit: 5, windowMs: AUTH_WINDOW_MS }, 1000, 4);
    expect(trackedKeyCount()).toBe(4);
  });
});
