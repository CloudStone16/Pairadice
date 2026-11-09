import { describe, expect, test } from "bun:test";
import { backoffMs, isLineLike, mergeLines } from "./lines";

const L = (messageId: number, content: string | null = "x") => ({ messageId, content });

describe("mergeLines", () => {
  test("replaces by id, inserts and sorts", () => {
    const out = mergeLines([L(1), L(3)], [L(2), L(3, null)]);
    expect(out.map((l) => l.messageId)).toEqual([1, 2, 3]);
    expect(out[2].content).toBeNull();
  });
  test("caps at max, dropping the oldest", () => {
    const prev = Array.from({ length: 5 }, (_, i) => L(i + 1));
    expect(mergeLines(prev, [L(6)], 3).map((l) => l.messageId)).toEqual([4, 5, 6]);
  });
});

describe("backoffMs", () => {
  test("doubles and caps at 60 s", () => {
    expect(backoffMs(1)).toBe(15000);
    expect(backoffMs(2)).toBe(30000);
    expect(backoffMs(3)).toBe(60000);
    expect(backoffMs(30)).toBe(60000);
  });
});

describe("isLineLike content", () => {
  const base = { messageId: 1, senderId: 2, sentAt: "2026-01-01T00:00:00Z" };
  test("accepts string, null, absent; rejects others", () => {
    expect(isLineLike({ ...base, content: "hi" })).toBe(true);
    expect(isLineLike({ ...base, content: null })).toBe(true);
    expect(isLineLike(base)).toBe(true);
    expect(isLineLike({ ...base, content: 5 })).toBe(false);
  });
});
