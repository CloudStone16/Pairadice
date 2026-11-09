import { describe, expect, test } from "bun:test";
import {
  validateAbout,
  validateAccount,
  validateAvailability,
  validateGameProfile,
  validateLanguages,
  validateTags,
} from "./validate";

const errs = (r: { ok: boolean; fieldErrors?: Record<string, string> }) => (r.ok ? {} : (r.fieldErrors ?? {}));

describe("validateAbout", () => {
  const base = { displayName: "  Ash  ", bio: "", timezone: "Asia/Kolkata", countryCode: "in", homeRegionId: "3", regionStrictness: "nearby" };
  test("trims and normalises", () => {
    const r = validateAbout(base);
    expect(r.ok && r.value).toMatchObject({ displayName: "Ash", countryCode: "IN", homeRegionId: 3, timezone: "Asia/Kolkata" });
  });
  test("empty optional fields become null", () => {
    const r = validateAbout({ ...base, timezone: "", countryCode: "", homeRegionId: "", regionStrictness: "" });
    expect(r.ok && r.value).toMatchObject({ timezone: null, countryCode: null, homeRegionId: null, regionStrictness: null });
  });
  test("rejects bad values", () => {
    const r = validateAbout({ ...base, displayName: "   ", bio: "x".repeat(501), timezone: "kolkata", regionStrictness: "wide", homeRegionId: "abc" });
    expect(Object.keys(errs(r)).sort()).toEqual(["bio", "displayName", "homeRegionId", "regionStrictness", "timezone"]);
  });
  test("accepts UTC and 64/500 boundaries", () => {
    expect(validateAbout({ ...base, timezone: "UTC", displayName: "a".repeat(64), bio: "b".repeat(500) }).ok).toBe(true);
    expect(validateAbout({ ...base, displayName: "a".repeat(65) }).ok).toBe(false);
  });
});

describe("validateLanguages", () => {
  test("primary must be selected", () => {
    expect(errs(validateLanguages({ languages: ["en", "hi"], primary: "fr" })).primary).toBeDefined();
    expect(validateLanguages({ languages: ["en", "hi"], primary: "hi" }).ok).toBe(true);
  });
  test("empty primary means first; needs at least one; max 8; dedupes", () => {
    expect(validateLanguages({ languages: ["en"], primary: "" }).ok).toBe(true);
    expect(errs(validateLanguages({ languages: [], primary: "" })).languages).toBeDefined();
    const nine = ["aa", "ab", "ac", "ad", "ae", "af", "ag", "ah", "ai"];
    expect(errs(validateLanguages({ languages: nine, primary: "" })).languages).toBeDefined();
    const r = validateLanguages({ languages: ["en", "EN"], primary: "" });
    expect(r.ok && r.value.codes).toEqual(["en"]);
  });
});

describe("validateTags", () => {
  test("limits and ids", () => {
    expect(validateTags({ tags: [] }).ok).toBe(true);
    expect(validateTags({ tags: ["1", "2", "2"] })).toEqual({ ok: true, value: { tagIds: [1, 2] } });
    expect(validateTags({ tags: Array.from({ length: 11 }, (_, i) => String(i + 1)) }).ok).toBe(false);
    expect(validateTags({ tags: ["x"] }).ok).toBe(false);
  });
});

describe("validateAccount", () => {
  test("valid new account", () => {
    const r = validateAccount({ accountId: "", platformId: "2", handle: " Ash ", discriminator: "", isPublic: "on" });
    expect(r.ok && r.value).toEqual({ accountId: null, platformId: 2, handle: "Ash", discriminator: "", isPublic: true });
  });
  test("handle, discriminator and platform rules", () => {
    const r = validateAccount({ accountId: "", platformId: "", handle: " ", discriminator: "x".repeat(17) });
    expect(Object.keys(errs(r)).sort()).toEqual(["discriminator", "handle", "platformId"]);
  });
});

describe("validateGameProfile", () => {
  const base = { gameId: "1", platformAccountId: "", rankId: "", modes: [], role1: "", role2: "", role3: "" };
  test("roles in order", () => {
    const r = validateGameProfile({ ...base, role1: "5", role2: "6" });
    expect(r.ok && r.value.roles).toEqual([{ role_id: 5, order: 1 }, { role_id: 6, order: 2 }]);
  });
  test("role2 without role1 is rejected", () => {
    expect(errs(validateGameProfile({ ...base, role2: "6" })).role2).toBeDefined();
  });
  test("duplicate roles rejected", () => {
    expect(errs(validateGameProfile({ ...base, role1: "5", role2: "5" })).role2).toBeDefined();
  });
  test("max 6 modes, dedupes", () => {
    expect(validateGameProfile({ ...base, modes: ["1", "2", "3", "4", "5", "6"] }).ok).toBe(true);
    expect(errs(validateGameProfile({ ...base, modes: ["1", "2", "3", "4", "5", "6", "7"] })).modes).toBeDefined();
    const r = validateGameProfile({ ...base, modes: ["1", "1"] });
    expect(r.ok && r.value.modeIds).toEqual([1]);
  });
  test("game required", () => {
    expect(errs(validateGameProfile({ ...base, gameId: "" })).gameId).toBeDefined();
  });
});

describe("validateAvailability", () => {
  const run = (slots: unknown) => validateAvailability({ slots: JSON.stringify(slots) });
  test("touching slots are allowed", () => {
    expect(run([{ day: 0, start: "10:00", end: "11:00" }, { day: 0, start: "11:00", end: "12:00" }]).ok).toBe(true);
  });
  test("overlap on the same day is rejected, other days fine", () => {
    expect(run([{ day: 0, start: "10:00", end: "11:30" }, { day: 0, start: "11:00", end: "12:00" }]).ok).toBe(false);
    expect(run([{ day: 0, start: "10:00", end: "11:30" }, { day: 1, start: "11:00", end: "12:00" }]).ok).toBe(true);
  });
  test("end must follow start; formats; day range", () => {
    expect(run([{ day: 0, start: "11:00", end: "11:00" }]).ok).toBe(false);
    expect(run([{ day: 0, start: "9:00", end: "10:00" }]).ok).toBe(false);
    expect(run([{ day: 0, start: "10:00", end: "24:00" }]).ok).toBe(true); // shared rule: 24:00 -> 23:59
    expect(run([{ day: 7, start: "10:00", end: "11:00" }]).ok).toBe(false);
  });
  test("empty clears; 28 max; bad JSON", () => {
    expect(run([]).ok).toBe(true);
    expect(validateAvailability({ slots: "" }).ok).toBe(true);
    const many = Array.from({ length: 29 }, (_, i) => ({ day: i % 7, start: `${String(i % 24).padStart(2, "0")}:00`, end: `${String(i % 24).padStart(2, "0")}:30` }));
    expect(run(many).ok).toBe(false);
    expect(validateAvailability({ slots: "{" }).ok).toBe(false);
  });
});

describe("input bounds", () => {
  test("oversized repeated fields and strings are rejected early", () => {
    expect(validateTags({ tags: Array.from({ length: 21 }, (_, i) => String(i + 1)) }).ok).toBe(false);
    expect(validateLanguages({ languages: Array(17).fill("en"), primary: "en" }).ok).toBe(false);
    expect(validateAbout({ displayName: "Ash", bio: "x".repeat(5000) }).ok).toBe(false);
    expect(validateAvailability({ slots: " ".repeat(9000) }).ok).toBe(false);
  });
  test("duplicates collapse", () => {
    const r = validateTags({ tags: ["1", "1", "2"] });
    expect(r.ok && r.value.tagIds).toEqual([1, 2]);
  });
  test("24:00 end of day normalises to 23:59", () => {
    const r = validateAvailability({ slots: JSON.stringify([{ day: 0, start: "21:00", end: "24:00" }]) });
    expect(r.ok && r.value.slots[0].end).toBe("23:59");
    expect(validateAvailability({ slots: JSON.stringify([{ day: 0, start: "21:00", end: "24:30" }]) }).ok).toBe(false);
  });
});
