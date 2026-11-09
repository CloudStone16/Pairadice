import { describe, expect, test } from "bun:test";
import { reportHref, validateReport, validateRoleChange, withReportedFlag } from "./validate";

const base = { reportedId: "7", category: "spam", description: "  too many ads ", session: "", message: "", back: "/camp/3" };

describe("validateReport", () => {
  test("trims and normalises", () => {
    const r = validateReport(base);
    expect(r.ok && r.value).toEqual({ reportedId: 7, category: "spam", description: "too many ads", sessionId: null, messageId: null, back: "/camp/3" });
  });
  test("empty description is null; ids parse", () => {
    const r = validateReport({ ...base, description: "  ", session: "12", message: "5" });
    expect(r.ok && r.value).toMatchObject({ description: null, sessionId: 12, messageId: 5 });
  });
  test("rejects bad category, long text, bad ids", () => {
    const r = validateReport({ ...base, category: "rude", description: "x".repeat(1001), session: "abc", reportedId: "0" });
    expect(r.ok).toBe(false);
    expect(r.ok ? [] : Object.keys(r.fieldErrors).sort()).toEqual(["category", "description", "reportedId", "session"]);
  });
  test("accepts exactly 1000 characters", () => {
    expect(validateReport({ ...base, description: "x".repeat(1000) }).ok).toBe(true);
  });
  test("unsafe back falls back to /hearth", () => {
    for (const back of ["//evil.example", "https://evil.example", "javascript:alert(1)", "", "/\\evil"]) {
      const r = validateReport({ ...base, back });
      expect(r.ok && r.value.back).toBe("/hearth");
    }
  });
});

describe("withReportedFlag", () => {
  test("adds the flag, keeps query and hash", () => {
    expect(withReportedFlag("/camp/3")).toBe("/camp/3?reported=1");
    expect(withReportedFlag("/friends?q=ab#x")).toBe("/friends?q=ab&reported=1#x");
    expect(withReportedFlag("/friends?reported=1")).toBe("/friends?reported=1");
  });
  test("unsafe path goes to the hearth", () => {
    expect(withReportedFlag("//evil.example")).toBe("/hearth?reported=1");
  });
  test("never produces an off-site target", () => {
    for (const p of ["/.//evil.com", "/a/..//evil.com", "/%2e//evil.com", "//evil.com", "/\\evil.com", "https://evil.com"]) {
      expect(withReportedFlag(p)).toBe("/hearth?reported=1");
    }
  });
  test("normal paths keep their shape", () => {
    expect(withReportedFlag("/character/7")).toBe("/character/7?reported=1");
    expect(withReportedFlag("/camp/3?tab=x#y")).toBe("/camp/3?tab=x&reported=1#y");
    expect(withReportedFlag("/friends")).toBe("/friends?reported=1");
  });
});

describe("reportHref", () => {
  test("encodes back and session", () => {
    expect(reportHref(4, "/camp/9?x=1", 9)).toBe("/report/4?session=9&back=%2Fcamp%2F9%3Fx%3D1");
    expect(reportHref(4, "/character/4")).toBe("/report/4?back=%2Fcharacter%2F4");
  });
});

describe("validateRoleChange", () => {
  test("accepts known roles only", () => {
    expect(validateRoleChange({ userId: "3", role: "moderator" }).ok).toBe(true);
    expect(validateRoleChange({ userId: "3", role: "root" }).ok).toBe(false);
    expect(validateRoleChange({ userId: "x", role: "admin" }).ok).toBe(false);
  });
});
