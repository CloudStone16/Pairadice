import { beforeAll, describe, expect, test } from "bun:test";
import { dummyVerify, hashPassword, validatePasswordPolicy, verifyPassword } from "../password";
import { hashToken, isValidRawToken, newRawToken } from "../token";
import { checkAll, checkRateLimit, resetRateLimit, signInLimits, signUpLimits } from "../rate-limit";
import { duplicateKind } from "../duplicate-key";

const SECRET_A = "a".repeat(40);
const SECRET_B = "b".repeat(40);

describe("password", () => {
  test("hash is argon2id and verifies", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(h).toContain("m=19456,t=2,p=1");
    expect(await verifyPassword(h, "correct horse battery")).toBe(true);
    expect(await verifyPassword(h, "wrong horse battery")).toBe(false);
  });
  test("malformed hashes are false, never throw", async () => {
    expect(await verifyPassword("", "x")).toBe(false);
    expect(await verifyPassword("garbage", "x")).toBe(false);
    expect(await verifyPassword("$argon2id$broken", "x")).toBe(false);
    expect(await verifyPassword("$2b$12$abcdefghijklmnopqrstuv", "x")).toBe(false);
  });
  test("dummyVerify is always false", async () => {
    expect(await dummyVerify("anything")).toBe(false);
  });
  test("policy", () => {
    expect(validatePasswordPolicy("longenough1")).toBeNull();
    expect(validatePasswordPolicy("short")).toContain("at least 10");
    expect(validatePasswordPolicy("x".repeat(129))).toContain("at most 128");
    expect(validatePasswordPolicy("          ")).toBe("Password cannot be blank.");
    expect(validatePasswordPolicy("")).toBe("Password cannot be blank.");
  });
});

describe("token", () => {
  beforeAll(() => {
    process.env.AUTH_SECRET = SECRET_A;
  });
  test("raw token shape", () => {
    const t = newRawToken();
    expect(t).toHaveLength(43);
    expect(isValidRawToken(t)).toBe(true);
    expect(newRawToken()).not.toBe(t);
  });
  test("roundtrip and secret dependence", () => {
    const t = newRawToken();
    const h1 = hashToken(t);
    expect(h1).toHaveLength(32);
    expect(hashToken(t).equals(h1)).toBe(true);
    process.env.AUTH_SECRET = SECRET_B;
    expect(hashToken(t).equals(h1)).toBe(false);
    process.env.AUTH_SECRET = SECRET_A;
  });
  test("bad format and missing secret rejected", () => {
    expect(() => hashToken("short")).toThrow();
    expect(() => hashToken("!".repeat(43))).toThrow();
    process.env.AUTH_SECRET = "tooshort";
    expect(() => hashToken(newRawToken())).toThrow(/AUTH_SECRET/);
    delete process.env.AUTH_SECRET;
    expect(() => hashToken(newRawToken())).toThrow(/AUTH_SECRET/);
    process.env.AUTH_SECRET = SECRET_A;
  });
});

describe("rate limit", () => {
  test("blocks after limit and recovers as window slides", () => {
    const key = "test:window";
    resetRateLimit(key);
    const o = { limit: 3, windowMs: 1000 };
    expect(checkRateLimit(key, o, 0).ok).toBe(true);
    expect(checkRateLimit(key, o, 100).ok).toBe(true);
    expect(checkRateLimit(key, o, 200).ok).toBe(true);
    const blocked = checkRateLimit(key, o, 300);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBe(700);
    expect(checkRateLimit(key, o, 1001).ok).toBe(true);
  });
  test("keys are independent; reset clears", () => {
    const o = { limit: 1, windowMs: 1000 };
    resetRateLimit("test:a");
    resetRateLimit("test:b");
    expect(checkRateLimit("test:a", o, 0).ok).toBe(true);
    expect(checkRateLimit("test:b", o, 0).ok).toBe(true);
    expect(checkRateLimit("test:a", o, 1).ok).toBe(false);
    resetRateLimit("test:a");
    expect(checkRateLimit("test:a", o, 2).ok).toBe(true);
  });
});

describe("duplicateKind", () => {
  const dup = (key: string) => ({ errno: 1062, sqlMessage: `Duplicate entry 'x' for key '${key}'` });
  test("exact key names", () => {
    expect(duplicateKind(dup("users.username"))).toBe("username_taken");
    expect(duplicateKind(dup("auth_account.uq_auth_email"))).toBe("email_taken");
  });
  test("other keys, errnos and shapes are not classified", () => {
    expect(duplicateKind(dup("auth_account.uq_auth_provider"))).toBeNull();
    expect(duplicateKind(dup("users.username_old"))).toBeNull();
    expect(duplicateKind({ errno: 1048, sqlMessage: "for key 'users.username'" })).toBeNull();
    expect(duplicateKind({ errno: 1062 })).toBeNull();
    expect(duplicateKind(null)).toBeNull();
    expect(duplicateKind("x")).toBeNull();
  });
});

describe("rate limit buckets", () => {
  test("sign-in: email+IP caps at 5, other IPs unaffected, global bucket present", () => {
    const ip = "203.0.113.9";
    const email = "ratelimit-a@example.com";
    for (const spec of signInLimits(ip, email)) resetRateLimit(spec.key);
    for (let i = 0; i < 5; i++) expect(checkAll(signInLimits(ip, email), i).ok).toBe(true);
    expect(checkAll(signInLimits(ip, email), 6).ok).toBe(false);
    expect(checkAll(signInLimits("198.51.100.1", email), 7).ok).toBe(true);
    const keys = signInLimits(ip, email).map((s) => s.key);
    expect(keys).toContain("signin:global");
    expect(keys.some((k) => k.startsWith("signin:email:"))).toBe(true);
    expect(signUpLimits(ip).map((s) => s.limit)).toEqual([10, 60]);
    for (const spec of [...signInLimits(ip, email), ...signInLimits("198.51.100.1", email)]) resetRateLimit(spec.key);
  });
});
