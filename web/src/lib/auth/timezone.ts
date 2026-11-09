// Shared timezone sanitiser (no server-only import: unit-testable).

/** An IANA zone name the runtime knows, or "UTC". */
export function validTimezone(tz: string): string {
  try {
    if (tz.length === 0 || tz.length > 64) return "UTC";
    new Intl.DateTimeFormat("en", { timeZone: tz }); // throws RangeError for an unknown zone
    return tz;
  } catch {
    return "UTC";
  }
}
