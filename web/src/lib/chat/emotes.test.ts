import { describe, expect, test } from "bun:test";
import { tokenizeEmotes } from "./emotes";

describe("tokenizeEmotes", () => {
  test("plain text is one part", () => {
    expect(tokenizeEmotes("hello there")).toEqual([{ kind: "text", text: "hello there" }]);
  });
  test("empty string has no parts", () => {
    expect(tokenizeEmotes("")).toEqual([]);
  });
  test("splits around emotes", () => {
    expect(tokenizeEmotes("nice :gg: all")).toEqual([
      { kind: "text", text: "nice " },
      { kind: "emote", token: ":gg:", sprite: "emote-gg" },
      { kind: "text", text: " all" },
    ]);
  });
  test("adjacent emotes and the longer :ggwp: token", () => {
    const parts = tokenizeEmotes(":ggwp::heart:");
    expect(parts.map((p) => (p.kind === "emote" ? p.token : p.text))).toEqual([":ggwp:", ":heart:"]);
  });
  test("unknown tokens and stray colons stay text", () => {
    expect(tokenizeEmotes("a :nope: b: :wave")).toEqual([{ kind: "text", text: "a :nope: b: :wave" }]);
  });
  test("is case sensitive and keeps newlines", () => {
    expect(tokenizeEmotes(":GG:\n:fire:").length).toBe(2);
  });
});
