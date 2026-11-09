import { describe, expect, test } from "bun:test";
import { DEFAULT_NEXT, safeNext, safeNextOrNull } from "./safe-next";

describe("safeNext", () => {
  test("keeps same-site paths", () => {
    for (const ok of ["/", "/hearth", "/camp/12?tab=chat", "/board/valorant#top", "/a%20b"]) {
      expect(safeNext(ok)).toBe(ok);
    }
  });
  test("rejects everything that can leave the site", () => {
    const bad = [
      "//evil.test",
      "///evil.test",
      "/\\evil.test",
      "\\\\evil.test",
      "https://evil.test",
      "javascript:alert(1)",
      "evil.test",
      "",
      "hearth",
      "/\tevil.test",
      "/\nhttps://evil.test",
      "/\u0000x",
      "/\u007fx",
      "/%2F/evil.test",
      "/%5Cevil.test".replace("%5C", "\\"),
      "/%0a/evil",
      "/%E0%A4%A",
      "/" + "a".repeat(3000),
    ];
    for (const b of bad) expect(safeNext(b)).toBe(DEFAULT_NEXT);
  });
  test("null and undefined fall back", () => {
    expect(safeNext(null)).toBe("/hearth");
    expect(safeNext(undefined, "/x")).toBe("/x");
    expect(safeNextOrNull("//x")).toBeNull();
  });
});

describe("sign-up next handling", () => {
  test("keeps the editor path, drops hostile values", () => {
    expect(safeNextOrNull("/character/edit")).toBe("/character/edit");
    expect(safeNextOrNull("//evil.example")).toBeNull();
    expect(safeNext("https://evil.example", DEFAULT_NEXT)).toBe(DEFAULT_NEXT);
    expect(safeNext(undefined)).toBe("/hearth");
  });
});
