import { describe, expect, test } from "bun:test";
import {
  normaliseEmail,
  safeNextPath,
  validateDisplayName,
  validateEmail,
  validateUsername,
} from "../validate";

describe("email", () => {
  test("normalises", () => expect(normaliseEmail("  Foo@Bar.COM ")).toBe("foo@bar.com"));
  test("accepts valid", () => expect(validateEmail("a@b.co")).toBeNull());
  test.each(["", "a", "a@b", "@b.co", "a@", "a@@b.co", "a b@c.co", "a@b..co", "a@.co", `${"a".repeat(250)}@b.co`])(
    "rejects %p",
    (e) => expect(validateEmail(e)).not.toBeNull(),
  );
});

describe("username", () => {
  test("accepts", () => expect(validateUsername("dice_roller9")).toBeNull());
  test.each(["", "ab", "a b c", "x".repeat(33), "bad-name", "émile"])("rejects %p", (u) =>
    expect(validateUsername(u)).not.toBeNull(),
  );
});

describe("displayName", () => {
  test("accepts", () => expect(validateDisplayName("Ada L.")).toBeNull());
  test("rejects empty, long, control", () => {
    expect(validateDisplayName("")).not.toBeNull();
    expect(validateDisplayName("x".repeat(65))).not.toBeNull();
    expect(validateDisplayName("a\u0007b")).not.toBeNull();
  });
});

describe("safeNextPath", () => {
  test("allows relative paths", () => {
    expect(safeNextPath("/ok?x=1")).toBe("/ok?x=1");
    expect(safeNextPath("/sessions/3")).toBe("/sessions/3");
  });
  test.each([
    "//evil.com",
    "/\\evil",
    "https://x",
    "javascript:alert(1)",
    "/a://b",
    "evil",
    "",
    "/a\nb",
    "/a\\b",
    `/${"a".repeat(200)}`,
  ])("rejects %p", (p) => expect(safeNextPath(p)).toBe("/hearth"));
  test("non-string", () => expect(safeNextPath(null)).toBe("/hearth"));
});
