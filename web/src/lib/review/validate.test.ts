import { describe, expect, test } from "bun:test";
import { validateReview } from "./validate";

const base = { sessionId: "4", reviewedId: "9", rating: "5", comment: "  great  " };

describe("validateReview", () => {
  test("trims and parses", () => {
    const r = validateReview(base);
    expect(r.ok && r.value).toEqual({ sessionId: 4, reviewedId: 9, rating: 5, comment: "great" });
  });
  test("empty comment is null", () => {
    const r = validateReview({ ...base, comment: "   " });
    expect(r.ok && r.value.comment).toBeNull();
  });
  test("rating must be an integer 1..5", () => {
    for (const rating of ["0", "6", "2.5", "", "abc", "-1"]) {
      const r = validateReview({ ...base, rating });
      expect(r.ok).toBe(false);
    }
  });
  test("rejects bad ids", () => {
    const r = validateReview({ ...base, sessionId: "0", reviewedId: "x" });
    expect(r.ok ? [] : Object.keys(r.fieldErrors).sort()).toEqual(["reviewedId", "sessionId"]);
  });
  test("comment limit is 500 after trimming", () => {
    expect(validateReview({ ...base, comment: "x".repeat(500) }).ok).toBe(true);
    expect(validateReview({ ...base, comment: ` ${"x".repeat(501)} ` }).ok).toBe(false);
  });
});
