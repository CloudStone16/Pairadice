import { describe, expect, test } from "bun:test";
import { ageSeconds, isDone, shortHash } from "./watch";
import type { DocSummary, Snapshot } from "./types";

const doc = (hash: string, updatedAt = "t1"): DocSummary => ({
  sourceText: "x", sourceHash: hash, model: "m", dims: 384, embeddedAt: "t0", updatedAt, status: "active", head: [],
});
const snap = (d: DocSummary | null, mongoDown = false): Snapshot => ({
  userId: 1, takenAt: "", doc: d, outbox: null, kindred: [], mongoDown,
});

describe("isDone", () => {
  test("update waits for a new hash or updated_at", () => {
    const before = snap(doc("a"));
    expect(isDone("update", before, snap(doc("a")))).toBe(false);
    expect(isDone("update", before, snap(doc("b")))).toBe(true);
    expect(isDone("update", before, snap(doc("a", "t2")))).toBe(true);
  });
  test("ban waits for the document to vanish, restore and create for it to appear", () => {
    expect(isDone("ban", snap(doc("a")), snap(doc("a")))).toBe(false);
    expect(isDone("ban", snap(doc("a")), snap(null))).toBe(true);
    expect(isDone("restore", snap(null), snap(null))).toBe(false);
    expect(isDone("create", snap(null), snap(doc("a")))).toBe(true);
  });
  test("never done while MongoDB is down", () => {
    expect(isDone("ban", snap(doc("a")), snap(null, true))).toBe(false);
  });
});

describe("helpers", () => {
  test("shortHash", () => {
    expect(shortHash("0123456789abcdef")).toBe("0123456789ab\u2026");
    expect(shortHash(null)).toBe("none");
  });
  test("ageSeconds reads MySQL UTC strings", () => {
    const now = Date.parse("2026-01-01T00:00:10Z");
    expect(ageSeconds("2026-01-01 00:00:00.000000", now)).toBe(10);
    expect(ageSeconds(null, now)).toBeNull();
  });
});
