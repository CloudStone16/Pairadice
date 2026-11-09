// Shared by the server actions and the client forms (no server-only import).

export type AuthField = "email" | "password" | "username" | "displayName" | "timezone";

export interface AuthFormState {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Partial<Record<AuthField, string>>;
  /** Echoed back so a failed submit does not clear the form. Never includes the password. */
  values?: { email?: string; username?: string; displayName?: string };
}

export const initialAuthState: AuthFormState = { status: "idle" };
