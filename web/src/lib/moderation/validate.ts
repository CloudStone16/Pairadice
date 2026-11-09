// Pure, client-safe validators and query-string parsers for the moderation screens. They mirror the rules in
// database/12_moderation.sql so people get field-level messages, but the database stays the authority and
// its 45000 messages are shown as they are. Field names: types.ts (FORM FIELD NAMES).
import {
  MOD_LIMITS,
  REPORT_CATEGORIES,
  REPORT_STATUSES,
  SANCTION_DAYS,
  SANCTION_TYPES,
  type ReportCategory,
  type ReportStatus,
  type SanctionType,
} from "./types";

export type RawInput = Record<string, string | undefined>;
export type FieldErrors = Record<string, string>;
export type Validated<T> = { ok: true; value: T } | { ok: false; fieldErrors: FieldErrors };

function str(input: RawInput, key: string): string {
  const v = input[key];
  return typeof v === "string" ? v : "";
}
function done<T>(errors: FieldErrors, value: T): Validated<T> {
  return Object.keys(errors).length > 0 ? { ok: false, fieldErrors: errors } : { ok: true, value };
}

/** A positive decimal id, or null. */
export function parseId(raw: string | undefined): number | null {
  const s = (raw ?? "").trim();
  if (!/^[0-9]{1,15}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Optional id: "" -> null (ok); invalid -> undefined. */
function optionalId(raw: string): number | null | undefined {
  if (raw.trim() === "") return null;
  return parseId(raw) ?? undefined;
}

function reason(input: RawInput, key: string, max: number, errors: FieldErrors, label: string): string {
  const text = str(input, key).trim();
  if (text.length < MOD_LIMITS.sanctionReasonMin) {
    errors[key] = `${label} needs at least ${MOD_LIMITS.sanctionReasonMin} characters.`;
  } else if (text.length > max) {
    errors[key] = `${label} can be at most ${max} characters.`;
  }
  return text;
}

// ---- claimReport

export function validateClaim(input: RawInput): Validated<{ reportId: number }> {
  const reportId = parseId(str(input, "reportId"));
  return reportId === null ? { ok: false, fieldErrors: { reportId: "That report could not be found." } } : { ok: true, value: { reportId } };
}

// ---- resolveReport

export interface ResolveInput {
  reportId: number;
  outcome: "dismissed" | "actioned";
  note: string;
}

export function validateResolve(input: RawInput): Validated<ResolveInput> {
  const errors: FieldErrors = {};
  const reportId = parseId(str(input, "reportId"));
  if (reportId === null) errors.reportId = "That report could not be found.";
  const outcome = str(input, "outcome");
  if (outcome !== "dismissed" && outcome !== "actioned") errors.outcome = "Pick dismissed or actioned.";
  const note = reason(input, "note", MOD_LIMITS.resolveNote, errors, "The note");
  return done(errors, { reportId: reportId ?? 0, outcome: outcome as ResolveInput["outcome"], note });
}

// ---- issueSanction

export interface SanctionInput {
  userId: number;
  type: SanctionType;
  days: number | null;
  reason: string;
  reportId: number | null;
  /** UTC "YYYY-MM-DD HH:MM:SS", or null for warn and ban. */
  endsAt: string | null;
  confirmed: boolean;
}

/** Suspend and ban need a second, deliberate submit. */
export function requiresConfirm(type: SanctionType): boolean {
  return type === "suspend" || type === "ban";
}

/** UTC DATETIME string as MySQL expects it. */
export function toMysqlUtc(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export function daysToEndsAt(days: number, now: Date): string {
  return toMysqlUtc(new Date(now.getTime() + days * 86_400_000));
}

export function validateSanction(input: RawInput, now: Date = new Date()): Validated<SanctionInput> {
  const errors: FieldErrors = {};
  const userId = parseId(str(input, "userId"));
  if (userId === null) errors.userId = "That player could not be found.";
  const typeRaw = str(input, "type");
  const type = (SANCTION_TYPES as readonly string[]).includes(typeRaw) ? (typeRaw as SanctionType) : null;
  if (type === null) errors.type = "Pick a sanction type.";
  const sanctionReason = reason(input, "reason", MOD_LIMITS.sanctionReasonMax, errors, "The reason");
  const reportId = optionalId(str(input, "reportId"));
  if (reportId === undefined) errors.reportId = "That report could not be found.";

  let days: number | null = null;
  let endsAt: string | null = null;
  const daysRaw = str(input, "days").trim();
  if (type === "mute" || type === "suspend") {
    const n = /^[0-9]{1,3}$/.test(daysRaw) ? Number(daysRaw) : NaN;
    if (!(SANCTION_DAYS as readonly number[]).includes(n)) {
      errors.days = `Pick ${SANCTION_DAYS.join(", ")} days.`;
    } else {
      days = n;
      endsAt = daysToEndsAt(n, now);
    }
  } else if (type !== null && daysRaw !== "") {
    errors.days = type === "warn" ? "A warning has no end date." : "A ban has no end date.";
  }

  return done(errors, {
    userId: userId ?? 0,
    type: (type ?? "warn") as SanctionType,
    days,
    reason: sanctionReason,
    reportId: reportId ?? null,
    endsAt,
    confirmed: str(input, "confirm") === "yes",
  });
}

// ---- liftSanction

export function validateLift(input: RawInput): Validated<{ sanctionId: number; reason: string }> {
  const errors: FieldErrors = {};
  const sanctionId = parseId(str(input, "sanctionId"));
  if (sanctionId === null) errors.sanctionId = "That sanction could not be found.";
  const text = reason(input, "reason", MOD_LIMITS.liftReasonMax, errors, "The reason");
  return done(errors, { sanctionId: sanctionId ?? 0, reason: text });
}

// ---- moderateMessage

export function validateModerate(input: RawInput): Validated<{ messageId: number; hide: boolean; reportId: number | null }> {
  const errors: FieldErrors = {};
  const messageId = parseId(str(input, "messageId"));
  if (messageId === null) errors.messageId = "That message could not be found.";
  const hideRaw = str(input, "hide");
  if (hideRaw !== "1" && hideRaw !== "0") errors.hide = "Choose hide or restore.";
  const reportId = optionalId(str(input, "reportId"));
  if (reportId === undefined) errors.reportId = "That report could not be found.";
  return done(errors, { messageId: messageId ?? 0, hide: hideRaw === "1", reportId: reportId ?? null });
}

// ---- query-string filters (pages)

export type SearchParams = Record<string, string | string[] | undefined>;

function first(sp: SearchParams, key: string): string {
  const v = sp[key];
  const s = Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
  return s.trim().slice(0, 64);
}

export type StatusFilter = "queue" | "all" | ReportStatus;
export interface ReportFilters {
  status: StatusFilter;
  category: ReportCategory | "all";
  /** keyset: only reports with a larger id */
  after: number | null;
}

export function parseReportFilters(sp: SearchParams): ReportFilters {
  const s = first(sp, "status");
  const status: StatusFilter =
    s === "all" || (REPORT_STATUSES as readonly string[]).includes(s) ? (s as StatusFilter) : "queue";
  const c = first(sp, "category");
  const category = (REPORT_CATEGORIES as readonly string[]).includes(c) ? (c as ReportCategory) : "all";
  return { status, category, after: parseId(first(sp, "after")) };
}

/** The report statuses a filter stands for. */
export function statusesFor(filter: StatusFilter): ReportStatus[] | null {
  if (filter === "all") return null;
  if (filter === "queue") return ["open", "reviewing"];
  return [filter];
}

export type SanctionTab = "active" | "ended" | "all";
export interface SanctionFilters {
  tab: SanctionTab;
  /** keyset: only sanctions with a smaller id */
  before: number | null;
}

export function parseSanctionFilters(sp: SearchParams): SanctionFilters {
  const t = first(sp, "tab");
  const tab: SanctionTab = t === "ended" || t === "all" ? t : "active";
  return { tab, before: parseId(first(sp, "before")) };
}

export interface AuditFilters {
  entity: string | null;
  action: string | null;
  actor: string | null;
  /** UTC calendar days, "YYYY-MM-DD" */
  from: string | null;
  to: string | null;
  before: number | null;
}

const NAME_RE = /^[a-z_]{1,64}$/;
const USERNAME_RE = /^[A-Za-z0-9_.-]{1,32}$/;

/** A real calendar day "YYYY-MM-DD", or null. */
export function parseDay(raw: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === raw ? raw : null;
}

export function parseAuditFilters(sp: SearchParams): AuditFilters {
  const entity = first(sp, "entity").toLowerCase();
  const action = first(sp, "action").toLowerCase();
  const actor = first(sp, "actor").replace(/^@/, "");
  return {
    entity: NAME_RE.test(entity) ? entity : null,
    action: NAME_RE.test(action) ? action : null,
    actor: USERNAME_RE.test(actor) ? actor : null,
    from: parseDay(first(sp, "from")),
    to: parseDay(first(sp, "to")),
    before: parseId(first(sp, "before")),
  };
}
