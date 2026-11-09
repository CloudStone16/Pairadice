// Pure, client-safe validators for the auth forms. No server-only / node imports.
import { USERNAME_PATTERN } from "@/lib/auth/form-state";

export const DEFAULT_NEXT_PATH = "/hearth";

export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Expects an already-normalised email. */
export function validateEmail(email: string): string | null {
  const msg = "Enter a valid email address.";
  if (email.length === 0) return "Email is required.";
  if (email.length > 254) return msg;
  if (/\s/.test(email)) return msg;
  const parts = email.split("@");
  if (parts.length !== 2) return msg;
  const [local, domain] = parts as [string, string];
  if (local.length === 0 || domain.length === 0) return msg;
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return msg;
  return null;
}

export function validateUsername(username: string): string | null {
  if (username.length === 0) return "Username is required.";
  if (!USERNAME_PATTERN.test(username)) return "Use 3-32 letters, numbers or underscores.";
  return null;
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

/** Expects a trimmed display name. */
export function validateDisplayName(name: string): string | null {
  if (name.length === 0) return "Display name is required.";
  if (name.length > 64) return "Display name must be at most 64 characters.";
  if (CONTROL_CHARS.test(name)) return "Display name contains invalid characters.";
  return null;
}

/** Same-site relative path only; anything suspicious falls back to /hearth. */
export function safeNextPath(raw: unknown): string {
  if (typeof raw !== "string") return DEFAULT_NEXT_PATH;
  if (raw.length === 0 || raw.length > 200) return DEFAULT_NEXT_PATH;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return DEFAULT_NEXT_PATH;
  if (raw.includes("://") || raw.includes("\\") || CONTROL_CHARS.test(raw)) return DEFAULT_NEXT_PATH;
  return raw;
}
