import { describe, expect, test } from "bun:test";
import { insertAtCaret } from "./caret";

describe("insertAtCaret", () => {
  test("empty text", () => {
    expect(insertAtCaret("", 0, 0, ":gg:")).toEqual({ text: ":gg: ", caret: 5 });
  });
  test("after a word adds a leading space", () => {
    expect(insertAtCaret("hi", 2, 2, ":wave:")).toEqual({ text: "hi :wave: ", caret: 10 });
  });
  test("mid text and replaced selection", () => {
    expect(insertAtCaret("a b", 1, 2, ":fire:")).toEqual({ text: "a :fire: b", caret: 9 });
  });
  test("out-of-range caret is clamped", () => {
    expect(insertAtCaret("x", 50, 60, ":gg:").text).toBe("x :gg: ");
  });
});
