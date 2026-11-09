import { beforeAll, describe, expect, mock, test } from "bun:test";
import { hashToken, isValidRawToken, newRawToken } from "./token";

// password.ts imports "server-only", which throws outside the React server build
mock.module("server-only", () => ({}));
const { hashPassword, verifyPassword } = await import("./password");

beforeAll(() => {
  process.env.AUTH_SECRET = "x".repeat(40);
});

describe("password", () => {
  test("argon2id hash verifies, wrong password fails", async () => {
    const h = await hashPassword("correct horse");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(h, "correct horse")).toBe(true);
    expect(await verifyPassword(h, "wrong")).toBe(false);
  });
  test("malformed hash returns false", async () => {
    expect(await verifyPassword("not-a-hash", "x")).toBe(false);
    expect(await verifyPassword("", "x")).toBe(false);
  });
});

describe("token", () => {
  test("raw token is 43 base64url chars and unique", () => {
    const t = newRawToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newRawToken()).not.toBe(t);
  });
  test("hashToken is 32 bytes and deterministic", () => {
    const t = newRawToken();
    const a = hashToken(t);
    expect(a.length).toBe(32);
    expect(a.equals(hashToken(t))).toBe(true);
    expect(a.equals(hashToken(newRawToken()))).toBe(false);
  });
  test("short AUTH_SECRET is rejected", () => {
    const old = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "short";
    expect(() => hashToken("a")).toThrow();
    process.env.AUTH_SECRET = old;
  });
});

describe("isValidRawToken", () => {
  test("accepts only 43 base64url characters", () => {
    expect(isValidRawToken(newRawToken())).toBe(true);
    expect(isValidRawToken("short")).toBe(false);
    expect(isValidRawToken(undefined)).toBe(false);
    expect(isValidRawToken("a".repeat(42) + "=")).toBe(false);
  });
});
