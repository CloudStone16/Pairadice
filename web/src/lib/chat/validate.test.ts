import { describe, expect, test } from "bun:test";
import { charCount, parseAfter, parseId, safeBack, validateMessage } from "./validate";
import { CHAT_LIMITS } from "./types";

describe("validateMessage", () => {
  test("trims and normalises line endings", () => {
    const r = validateMessage("  hi\r\nthere \r\n");
    expect(r).toEqual({ ok: true, value: "hi\nthere" });
  });
  test("rejects empty and whitespace-only", () => {
    expect(validateMessage("").ok).toBe(false);
    expect(validateMessage("  \n\t ").ok).toBe(false);
    expect(validateMessage(null).ok).toBe(false);
  });
  test("accepts exactly the maximum and rejects one more", () => {
    expect(validateMessage("a".repeat(CHAT_LIMITS.messageMax)).ok).toBe(true);
    const r = validateMessage("a".repeat(CHAT_LIMITS.messageMax + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("1 too many");
  });
  test("counts code points, not UTF-16 units", () => {
    expect(charCount("a\u{1F600}")).toBe(2);
    expect(validateMessage("\u{1F600}".repeat(CHAT_LIMITS.messageMax)).ok).toBe(true);
  });
  test("rejects control characters but allows newline and tab", () => {
    expect(validateMessage("a\u0000b").ok).toBe(false);
    expect(validateMessage("a\tb\nc").ok).toBe(true);
  });
  test("keeps markup as plain text", () => {
    expect(validateMessage("<b>x</b>")).toEqual({ ok: true, value: "<b>x</b>" });
  });
});

describe("parseId and parseAfter", () => {
  test("ids", () => {
    expect(parseId("12")).toBe(12);
    expect(parseId("0")).toBeNull();
    expect(parseId("-1")).toBeNull();
    expect(parseId("1e3")).toBeNull();
    expect(parseId("9".repeat(16))).toBeNull();
    expect(parseId(undefined)).toBeNull();
  });
  test("after", () => {
    expect(parseAfter(null)).toEqual({ ok: true, value: null });
    expect(parseAfter("")).toEqual({ ok: true, value: null });
    expect(parseAfter("0")).toEqual({ ok: true, value: null });
    expect(parseAfter("41")).toEqual({ ok: true, value: 41 });
    expect(parseAfter("abc").ok).toBe(false);
    expect(parseAfter("-3").ok).toBe(false);
  });
});

describe("safeBack", () => {
  test("same-site paths only", () => {
    expect(safeBack("/camp/3", "/hearth")).toBe("/camp/3");
    expect(safeBack("https://evil.example", "/hearth")).toBe("/hearth");
    expect(safeBack("//evil.example", "/hearth")).toBe("/hearth");
    expect(safeBack(undefined, "/hearth")).toBe("/hearth");
  });
});
