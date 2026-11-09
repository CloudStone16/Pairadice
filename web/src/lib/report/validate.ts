// Pure validators for the player-side report form (no server-only: unit-testable). The database
// (sp_report_user) stays the authority; this gives field-level messages and builds the redirect target.
import { safeNext } from "@/lib/auth/safe-next";
import { MOD_LIMITS, REPORT_CATEGORIES, ROLE_NAMES, type ReportCategory, type RoleName } from "@/lib/moderation/types";

export type RawInput = Record<string, string | undefined>;
export type FieldErrors = Record<string, string>;
export type Validated<T> = { ok: true; value: T } | { ok: false; fieldErrors: FieldErrors };

export const CATEGORY_LABELS: Record<ReportCategory, { label: string; hint: string }> = {
  harassment: { label: "Harassment", hint: "Insults, threats or hateful language" },
  cheating: { label: "Cheating", hint: "Hacks, exploits or throwing games" },
  spam: { label: "Spam", hint: "Ads, floods or repeated nonsense" },
  no_show: { label: "No-show", hint: "Said they would come and did not" },
  other: { label: "Something else", hint: "Anything a moderator should know" },
};

/** A positive decimal id, or null. */
export function parseId(raw: string | undefined): number | null {
  const s = (raw ?? "").trim();
  if (!/^[0-9]{1,15}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export interface ReportInput {
  reportedId: number;
  category: ReportCategory;
  description: string | null;
  sessionId: number | null;
  messageId: number | null;
  back: string;
}

export function validateReport(input: RawInput): Validated<ReportInput> {
  const errors: FieldErrors = {};
  const reportedId = parseId(input.reportedId);
  if (reportedId === null) errors.reportedId = "That player could not be found.";
  const category = REPORT_CATEGORIES.find((c) => c === input.category);
  if (!category) errors.category = "Pick what happened.";
  const description = (input.description ?? "").replace(/\r\n/g, "\n").trim();
  if (description.length > MOD_LIMITS.reportDescription) {
    errors.description = `Keep it to ${MOD_LIMITS.reportDescription} characters (now ${description.length}).`;
  }
  const optId = (raw: string | undefined, key: string): number | null => {
    if ((raw ?? "").trim() === "") return null;
    const n = parseId(raw);
    if (n === null) errors[key] = "That reference is not valid.";
    return n;
  };
  const sessionId = optId(input.session, "session");
  const messageId = optId(input.message, "message");
  if (Object.keys(errors).length > 0 || reportedId === null || !category) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    value: {
      reportedId,
      category,
      description: description === "" ? null : description,
      sessionId,
      messageId,
      back: safeNext(input.back, "/hearth"),
    },
  };
}

/** Append `reported=1` to a same-site path, keeping other query parameters and the hash. Never re-normalises the path. */
export function withReportedFlag(path: string): string {
  const base = safeNext(path, "/hearth");
  const h = base.indexOf("#");
  const beforeHash = h === -1 ? base : base.slice(0, h);
  const hash = h === -1 ? "" : base.slice(h);
  const hasFlag = /[?&]reported=1(?:&|$)/.test(beforeHash);
  const sep = beforeHash.includes("?") ? "&" : "?";
  const result = `${beforeHash}${hasFlag ? "" : `${sep}reported=1`}${hash}`;
  return safeNext(result, "") === result ? result : "/hearth";
}

/** The /report/<id> link for an entry point. `back` is the current path (already without the status flag). */
export function reportHref(userId: number, back: string, sessionId?: number | null, message?: number | null): string {
  const p = new URLSearchParams();
  if (sessionId) p.set("session", String(sessionId));
  p.set("back", back);
  if (message) p.set("message", String(message));
  return `/report/${userId}?${p.toString()}`;
}

export interface RoleInput {
  userId: number;
  role: RoleName;
}

export function validateRoleChange(input: RawInput): Validated<RoleInput> {
  const errors: FieldErrors = {};
  const userId = parseId(input.userId);
  if (userId === null) errors.userId = "Unknown player.";
  const role = ROLE_NAMES.find((r) => r === input.role);
  if (!role) errors.role = "Pick a role.";
  if (userId === null || !role) return { ok: false, fieldErrors: errors };
  return { ok: true, value: { userId, role } };
}
