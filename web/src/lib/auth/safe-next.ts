// The one validator for "where to go after sign-in" values (no server-only import: unit-testable).

export const DEFAULT_NEXT = "/hearth";
const MAX_LENGTH = 2048;
// C0 controls, DEL and C1 controls: browsers strip tabs/newlines inside URLs, which can turn "/\t/host" into "//host".
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

function isSameSitePath(value: string): boolean {
  if (value.length === 0 || value.length > MAX_LENGTH) return false;
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  if (value.includes("\\") || CONTROL.test(value)) return false;
  // "/" followed by anything that parses as a different origin is not a path (scheme or authority tricks)
  try {
    if (new URL(value, "http://pairadice.invalid").origin !== "http://pairadice.invalid") return false;
  } catch {
    return false;
  }
  return true;
}

/** A same-site relative path, or null. Encoded slashes and backslashes in the leading segment are rejected too. */
export function safeNextOrNull(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || !isSameSitePath(raw)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (decoded !== raw && !isSameSitePath(decoded)) return null;
  return raw;
}

/** A same-site relative path, or `fallback`. */
export function safeNext(raw: string | null | undefined, fallback: string = DEFAULT_NEXT): string {
  return safeNextOrNull(raw) ?? fallback;
}
