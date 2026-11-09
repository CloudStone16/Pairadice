import { describe, expect, test } from "bun:test";
import {
  daysToEndsAt,
  parseAuditFilters,
  parseDay,
  parseId,
  parseReportFilters,
  parseSanctionFilters,
  requiresConfirm,
  statusesFor,
  validateClaim,
  validateLift,
  validateModerate,
  validateResolve,
  validateSanction,
} from "./validate";
import { formatAge, formatRelative, toIso } from "./time";

const errs = (r: { ok: boolean; fieldErrors?: Record<string, string> }) => (r.ok ? {} : (r.fieldErrors ?? {}));
const NOW = new Date("2026-03-01T10:00:00Z");

describe("parseId", () => {
  test("accepts positive decimals only", () => {
    expect(parseId("42")).toBe(42);
    expect(parseId(" 7 ")).toBe(7);
    for (const bad of ["0", "-1", "1.5", "abc", "", "1e3", "9".repeat(16), undefined]) expect(parseId(bad)).toBeNull();
  });
});

describe("claim and resolve", () => {
  test("claim needs a report id", () => {
    expect(validateClaim({ reportId: "5" })).toEqual({ ok: true, value: { reportId: 5 } });
    expect(errs(validateClaim({ reportId: "x" })).reportId).toBeDefined();
  });
  test("resolve needs outcome and note", () => {
    const ok = validateResolve({ reportId: "5", outcome: "dismissed", note: "  Not a violation  " });
    expect(ok.ok && ok.value).toEqual({ reportId: 5, outcome: "dismissed", note: "Not a violation" });
    expect(Object.keys(errs(validateResolve({ reportId: "5", outcome: "banned", note: "no" }))).sort()).toEqual(["note", "outcome"]);
    expect(errs(validateResolve({ reportId: "5", outcome: "actioned", note: "x".repeat(501) })).note).toBeDefined();
  });
});

describe("validateSanction", () => {
  const base = { userId: "9", type: "mute", days: "3", reason: "Spamming the chat", reportId: "12", confirm: "" };
  test("mute converts days to a UTC end date", () => {
    const r = validateSanction(base, NOW);
    expect(r.ok && r.value).toMatchObject({ userId: 9, type: "mute", days: 3, reportId: 12, endsAt: "2026-03-04 10:00:00", confirmed: false });
  });
  test("warn and ban take no end date", () => {
    const warn = validateSanction({ ...base, type: "warn", days: "" }, NOW);
    expect(warn.ok && warn.value.endsAt).toBeNull();
    expect(errs(validateSanction({ ...base, type: "ban", days: "7" }, NOW)).days).toBeDefined();
  });
  test("mute and suspend need an allowed duration", () => {
    for (const days of ["", "2", "91", "x"]) expect(errs(validateSanction({ ...base, type: "suspend", days }, NOW)).days).toBeDefined();
    for (const days of ["1", "3", "7", "30"]) expect(validateSanction({ ...base, type: "suspend", days }, NOW).ok).toBe(true);
  });
  test("reason length and optional report", () => {
    expect(errs(validateSanction({ ...base, reason: "ab" }, NOW)).reason).toBeDefined();
    expect(errs(validateSanction({ ...base, reason: "x".repeat(256) }, NOW)).reason).toBeDefined();
    const r = validateSanction({ ...base, reportId: "" }, NOW);
    expect(r.ok && r.value.reportId).toBeNull();
    expect(errs(validateSanction({ ...base, reportId: "abc" }, NOW)).reportId).toBeDefined();
  });
  test("bad type and user", () => {
    expect(Object.keys(errs(validateSanction({ ...base, type: "kick", userId: "0" }, NOW))).sort()).toEqual(["type", "userId"]);
  });
  test("confirm flag", () => {
    const r = validateSanction({ ...base, type: "suspend", confirm: "yes" }, NOW);
    expect(r.ok && r.value.confirmed).toBe(true);
    expect(requiresConfirm("suspend")).toBe(true);
    expect(requiresConfirm("ban")).toBe(true);
    expect(requiresConfirm("mute")).toBe(false);
    expect(requiresConfirm("warn")).toBe(false);
  });
});

describe("lift and moderate", () => {
  test("lift needs id and reason", () => {
    expect(validateLift({ sanctionId: "3", reason: "Apologised" }).ok).toBe(true);
    expect(Object.keys(errs(validateLift({ sanctionId: "", reason: "" }))).sort()).toEqual(["reason", "sanctionId"]);
  });
  test("moderate takes hide 1/0 and an optional report", () => {
    const r = validateModerate({ messageId: "8", hide: "1", reportId: "" });
    expect(r.ok && r.value).toEqual({ messageId: 8, hide: true, reportId: null });
    const s = validateModerate({ messageId: "8", hide: "0", reportId: "4" });
    expect(s.ok && s.value).toEqual({ messageId: 8, hide: false, reportId: 4 });
    expect(errs(validateModerate({ messageId: "8", hide: "2", reportId: "" })).hide).toBeDefined();
  });
});

describe("daysToEndsAt", () => {
  test("is UTC and second precision", () => {
    expect(daysToEndsAt(30, NOW)).toBe("2026-03-31 10:00:00");
  });
});

describe("filters", () => {
  test("report filters default to the queue and ignore junk", () => {
    expect(parseReportFilters({})).toEqual({ status: "queue", category: "all", after: null });
    expect(parseReportFilters({ status: "dismissed", category: "spam", after: "40" })).toEqual({ status: "dismissed", category: "spam", after: 40 });
    expect(parseReportFilters({ status: "x'; DROP", category: ["cheating", "spam"], after: "-3" })).toEqual({ status: "queue", category: "cheating", after: null });
    expect(statusesFor("queue")).toEqual(["open", "reviewing"]);
    expect(statusesFor("all")).toBeNull();
    expect(statusesFor("actioned")).toEqual(["actioned"]);
  });
  test("sanction tabs", () => {
    expect(parseSanctionFilters({}).tab).toBe("active");
    expect(parseSanctionFilters({ tab: "ended", before: "9" })).toEqual({ tab: "ended", before: 9 });
    expect(parseSanctionFilters({ tab: "weird" }).tab).toBe("active");
  });
  test("audit filters validate names, dates and cursor", () => {
    const f = parseAuditFilters({ entity: "Sanction", action: "lift", actor: "@mod_ash", from: "2026-02-30", to: "2026-03-01", before: "100" });
    expect(f).toEqual({ entity: "sanction", action: "lift", actor: "mod_ash", from: null, to: "2026-03-01", before: 100 });
    const bad = parseAuditFilters({ entity: "a b", action: "x;y", actor: "no spaces here" });
    expect(bad).toMatchObject({ entity: null, action: null, actor: null });
    expect(parseDay("2026-02-28")).toBe("2026-02-28");
    expect(parseDay("2026-2-8")).toBeNull();
  });
});

describe("time helpers", () => {
  const now = Date.parse("2026-03-01T10:00:00Z");
  test("formatRelative", () => {
    expect(formatRelative("2026-03-03T14:00:00Z", now)).toBe("in 2 d 4 h");
    expect(formatRelative("2026-03-01T10:35:00Z", now)).toBe("in 35 min");
    expect(formatRelative("2026-03-01T07:00:00Z", now)).toBe("3 h ago");
    expect(formatRelative("2026-03-01T10:00:20Z", now)).toBe("just now");
    expect(formatRelative(null, now)).toBe("");
  });
  test("formatAge and toIso", () => {
    expect(formatAge("2026-02-27T08:00:00Z", now)).toBe("2 d 2 h");
    expect(toIso("2026-03-01 10:00:00")).toBe("2026-03-01T10:00:00Z");
    expect(toIso(null)).toBeNull();
    expect(toIso("junk")).toBeNull();
  });
});
