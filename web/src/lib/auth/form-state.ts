// Shared contract between the auth server actions (src/app/(auth)/actions.ts)
// and the auth UI (src/components/auth/**). Plain types/constants only, so it is
// safe to import from client components.

/** Form field names used by the sign-in / sign-up forms (also the FormData keys). */
export type AuthField = "email" | "password" | "confirm" | "username" | "displayName";

/** Values echoed back after a failed submit so the form can be refilled (never the password). */
export interface AuthFormValues {
  email?: string;
  username?: string;
  displayName?: string;
}

export type AuthFormState =
  | { status: "idle" }
  | {
      status: "error";
      /** One user-facing sentence for the whole form (shown in an alert / live region). */
      message: string;
      /** Optional per-field messages, keyed by AuthField. */
      fieldErrors?: Partial<Record<AuthField, string>>;
      values?: AuthFormValues;
    };

export const INITIAL_AUTH_STATE: AuthFormState = { status: "idle" };

/**
 * FormData keys:
 *   sign-in : email, password, next (hidden, optional same-site path to return to)
 *   sign-up : email, username, displayName, password, confirm, next (hidden, optional)
 * On success the actions redirect (to `next` if it is a safe relative path, else /hearth);
 * they only ever return an "error" state.
 */
export const AUTH_NEXT_FIELD = "next";

/** Password length policy shared by the client hints/inputs and server validation (password.ts). */
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/** Username rule shared by client hints and server validation (matches users.username VARCHAR(32)). */
export const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,32}$/;
