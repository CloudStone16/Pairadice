import { describe, expect, test } from "bun:test";
import {
  EMAIL_TAKEN_MESSAGE,
  GENERIC_ERROR,
  USERNAME_TAKEN_MESSAGE,
  describeError,
  mapSignUpError,
  redactDbText,
} from "./signup-errors";

const signal = (sqlMessage: string) => ({ sqlState: "45000", sqlMessage });

describe("mapSignUpError", () => {
  test("username taken: field error", () => {
    const r = mapSignUpError(signal("That username is taken"));
    expect(r.message).toBe(USERNAME_TAKEN_MESSAGE);
    expect(r.fieldErrors).toEqual({ username: "That username is taken." });
  });
  test("email taken: neutral message, no field error", () => {
    const r = mapSignUpError(signal("That email already has an account"));
    expect(r.message).toBe(EMAIL_TAKEN_MESSAGE);
    expect(r.fieldErrors).toBeUndefined();
    expect(r.message).not.toMatch(/already has an account/i);
  });
  test("matches the SIGNAL text exactly, not by keyword", () => {
    for (const m of [
      "That username is taken, sorry",
      "username",
      "Something about the email",
      "Username must be 3-32 letters, digits or underscores",
      "Display name is required",
    ]) {
      expect(mapSignUpError(signal(m))).toEqual({ message: GENERIC_ERROR });
    }
  });
  test("only SQLSTATE 45000 counts", () => {
    expect(mapSignUpError({ sqlState: "23000", sqlMessage: "That username is taken" })).toEqual({ message: GENERIC_ERROR });
  });
  test("never echoes raw database text", () => {
    const r = mapSignUpError({ sqlState: "23000", code: "ER_DUP_ENTRY", sqlMessage: "Duplicate entry 'a@b.co' for key 'x'" });
    expect(JSON.stringify(r)).not.toContain("a@b.co");
    expect(mapSignUpError(new Error("boom"))).toEqual({ message: GENERIC_ERROR });
    expect(mapSignUpError(null)).toEqual({ message: GENERIC_ERROR });
    expect(mapSignUpError("x")).toEqual({ message: GENERIC_ERROR });
  });
});

describe("log redaction", () => {
  test("hides the duplicate value", () => {
    expect(redactDbText("Duplicate entry 'me@example.com' for key 'auth_account.email'")).toBe(
      "Duplicate entry '<redacted>' for key 'auth_account.email'",
    );
  });
  test("describeError keeps the code, drops the value", () => {
    const err = Object.assign(new Error("Duplicate entry 'bob' for key 'users.username'"), { code: "ER_DUP_ENTRY" });
    const text = describeError(err);
    expect(text).toContain("ER_DUP_ENTRY");
    expect(text).not.toContain("bob");
    expect(describeError("weird")).toBe("unknown");
  });
});
