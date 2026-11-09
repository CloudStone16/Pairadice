// Maps sp_register_user failures to fixed, user-safe messages (no server-only import: unit-testable).
// The stored procedure raises SQLSTATE 45000 with these exact texts (database/08_auth.sql); anything
// else, including raw database text, is never shown.
import type { AuthField } from "./form-state";

export const GENERIC_ERROR = "Something went wrong, please try again.";
export const USERNAME_TAKEN_SIGNAL = "That username is taken";
export const EMAIL_TAKEN_SIGNAL = "That email already has an account";
export const USERNAME_TAKEN_MESSAGE = "That username is taken.";
/** Neutral on purpose: it must not confirm that an email has an account. */
export const EMAIL_TAKEN_MESSAGE = "We couldn't create that account. If you already have one, sign in instead.";

export interface SignUpFailure {
  message: string;
  fieldErrors?: Partial<Record<AuthField, string>>;
}

interface MysqlErrorLike {
  sqlState?: unknown;
  sqlMessage?: unknown;
}

export function mapSignUpError(err: unknown): SignUpFailure {
  const e: MysqlErrorLike = typeof err === "object" && err !== null ? err : {};
  if (e.sqlState === "45000" && typeof e.sqlMessage === "string") {
    if (e.sqlMessage === USERNAME_TAKEN_SIGNAL) {
      return { message: USERNAME_TAKEN_MESSAGE, fieldErrors: { username: USERNAME_TAKEN_MESSAGE } };
    }
    if (e.sqlMessage === EMAIL_TAKEN_SIGNAL) return { message: EMAIL_TAKEN_MESSAGE };
  }
  return { message: GENERIC_ERROR };
}

/** Error text that is safe to log: MySQL echoes the duplicate value (an email or username) in "Duplicate entry '...'". */
export function redactDbText(text: string): string {
  return text.replace(/Duplicate entry '[\s\S]*?' for key/gi, "Duplicate entry '<redacted>' for key");
}

/** A log-safe one-line description of an unknown error (code and redacted message only). */
export function describeError(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as { code?: unknown }).code;
    return `${typeof code === "string" ? `${code}: ` : ""}${redactDbText(err.message)}`;
  }
  return "unknown";
}
