"use server";

// Moderation server actions (form field names: src/lib/moderation/types.ts). Each action re-checks the
// moderator role (a server action is a public POST endpoint), copies only allow-listed fields, validates
// (src/lib/moderation/validate.ts, defence only: the stored procedures are the authority), runs ONE
// procedure through the viewer's own login, then revalidates /mod. Never logs form values.
import { revalidatePath } from "next/cache";
import { hasRole, requireRole } from "@/lib/auth/guards";
import * as db from "@/lib/mutations/moderation";
import type { ActionResult } from "@/lib/mutations/run";
import type { ModFormState } from "@/lib/moderation/types";
import {
  requiresConfirm,
  validateClaim,
  validateLift,
  validateModerate,
  validateResolve,
  validateSanction,
  type RawInput,
  type Validated,
} from "@/lib/moderation/validate";

const PATH = "/mod";
const MAX_KEYS = 16;
const MAX_VALUE = 2048;

const CLAIM = ["reportId"];
const RESOLVE = ["reportId", "outcome", "note"];
const SANCTION = ["userId", "type", "days", "reason", "reportId", "confirm"];
const LIFT = ["sanctionId", "reason"];
const MODERATE = ["messageId", "hide", "reportId"];

const BAD: ModFormState = { status: "error", message: "That request was not understood. Reload the page and try again." };

/** Allow-listed, bounded copy of the form (a plain object: it is echoed back to a Client Component). */
function collect(formData: FormData, allowed: readonly string[]): Record<string, string> | null {
  const out: Record<string, string> = {};
  let count = 0;
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue; // React's own action plumbing
    if (++count > MAX_KEYS || !allowed.includes(key)) return null;
    const v = formData.get(key);
    if (typeof v !== "string" || v.length > MAX_VALUE) return null;
    out[key] = v;
  }
  return out;
}

function invalid(values: Record<string, string>, fieldErrors: Record<string, string>): ModFormState {
  return { status: "error", message: "Some details need another look.", fieldErrors, values };
}

function finish(res: ActionResult<unknown>, saved: string, values: Record<string, string>): ModFormState {
  if (!res.ok) return { status: "error", message: res.message, values };
  // one revalidation covers every /mod page (queue, detail, sanctions, audit and the overview counts)
  revalidatePath(PATH, "layout");
  return { status: "saved", message: saved };
}

/** Collect and validate in one step; the caller returns `state` when it is set. */
function read<T>(
  formData: FormData,
  allowed: readonly string[],
  validate: (input: RawInput) => Validated<T>,
): { state: ModFormState; value?: undefined; values?: undefined } | { state?: undefined; value: T; values: Record<string, string> } {
  const values = collect(formData, allowed);
  if (values === null) return { state: BAD };
  const checked = validate(values);
  if (!checked.ok) return { state: invalid(values, checked.fieldErrors) };
  return { value: checked.value, values };
}

export async function claimReport(_prev: ModFormState, formData: FormData): Promise<ModFormState> {
  const viewer = await requireRole("moderator", PATH);
  const r = read(formData, CLAIM, validateClaim);
  if (r.state) return r.state;
  return finish(await db.claimReport(viewer, r.value.reportId), "You took this report. It is yours to handle.", r.values);
}

export async function resolveReport(_prev: ModFormState, formData: FormData): Promise<ModFormState> {
  const viewer = await requireRole("moderator", PATH);
  const r = read(formData, RESOLVE, validateResolve);
  if (r.state) return r.state;
  const { reportId, outcome, note } = r.value;
  return finish(
    await db.resolveReport(viewer, reportId, outcome, note),
    outcome === "dismissed" ? "Report dismissed." : "Report closed as actioned.",
    r.values,
  );
}

export async function issueSanction(_prev: ModFormState, formData: FormData): Promise<ModFormState> {
  const viewer = await requireRole("moderator", PATH);
  const r = read(formData, SANCTION, (input) => validateSanction(input));
  if (r.state) return r.state;
  const s = r.value;
  // a ban is admin-only; the database refuses it for anyone else, this only spares the round trip
  if (s.type === "ban" && !hasRole(viewer, "admin")) {
    return { status: "error", message: "Only admins can ban users.", values: r.values };
  }
  if (requiresConfirm(s.type) && !s.confirmed) {
    const what = s.type === "ban" ? "Ban this player permanently" : `Suspend this player for ${s.days} day${s.days === 1 ? "" : "s"}`;
    return {
      status: "error",
      message: `${what}? Press the confirm button to go ahead.`,
      fieldErrors: { confirm: "Confirmation needed." },
      values: r.values,
    };
  }
  const res = await db.issueSanction(viewer, {
    userId: s.userId,
    type: s.type,
    reason: s.reason,
    endsAt: s.endsAt,
    reportId: s.reportId,
  });
  const done: Record<string, string> = { warn: "Warning issued.", mute: "Mute issued.", suspend: "Suspension issued.", ban: "Ban issued." };
  return finish(res, `${done[s.type]}${s.reportId !== null ? " The report is closed as actioned." : ""}`, r.values);
}

export async function liftSanction(_prev: ModFormState, formData: FormData): Promise<ModFormState> {
  const viewer = await requireRole("moderator", PATH);
  const r = read(formData, LIFT, validateLift);
  if (r.state) return r.state;
  return finish(await db.liftSanction(viewer, r.value.sanctionId, r.value.reason), "Sanction lifted.", r.values);
}

export async function moderateMessage(_prev: ModFormState, formData: FormData): Promise<ModFormState> {
  const viewer = await requireRole("moderator", PATH);
  const r = read(formData, MODERATE, validateModerate);
  if (r.state) return r.state;
  const { messageId, hide, reportId } = r.value;
  return finish(await db.moderateMessage(viewer, messageId, hide, reportId), hide ? "Message hidden." : "Message restored.", r.values);
}

export async function runExpiry(_prev: ModFormState, formData: FormData): Promise<ModFormState> {
  const viewer = await requireRole("moderator", PATH);
  if (collect(formData, []) === null) return BAD;
  return finish(await db.expireSanctions(viewer), "Expiry ran. Ended suspensions are back to normal.", {});
}
