import "server-only";
import { queryAs, type DbLogin, type SqlParam } from "@/lib/db";
import { readCtx } from "@/lib/read-login";
import type { Viewer } from "@/lib/auth/viewer";
import { hasRole } from "@/lib/auth/guards";
import { toIso } from "@/lib/moderation/time";
import { MOD_LIMITS } from "@/lib/moderation/types";
import type {
  AuditRow,
  ReportCategory,
  ReportRow,
  ReportStatus,
  SanctionRow,
  SanctionType,
  UserChip,
} from "@/lib/moderation/types";
import type { AuditFilters, ReportFilters, SanctionFilters } from "@/lib/moderation/validate";
import { statusesFor } from "@/lib/moderation/validate";

// Typed reads for /mod. They run through the viewer's own moderator or admin login (readCtx), which holds
// SELECT on report, sanction, audit_log, users and message. BIGINT ids may arrive as strings: Number() them.

type Row = Record<string, unknown>;

// In force = a mute, suspension or ban that has started and not ended. A warning has no end date but restricts nothing.
const ACTIVE_EXPR =
  "(s.sanction_type IN ('mute', 'suspend', 'ban') AND s.starts_at <= UTC_TIMESTAMP() AND (s.ends_at IS NULL OR s.ends_at > UTC_TIMESTAMP()))";

/** Chip columns for a users alias; `p` is a constant column prefix. */
function chipCols(alias: string, p: string): string {
  return `${alias}.user_id AS ${p}_id, ${alias}.username AS ${p}_username, ${alias}.display_name AS ${p}_name, ${alias}.status AS ${p}_status`;
}

function chip(r: Row, p: string): UserChip {
  return {
    userId: Number(r[`${p}_id`]),
    username: String(r[`${p}_username`]),
    displayName: String(r[`${p}_name`]),
    status: r[`${p}_status`] as UserChip["status"],
  };
}

function chipOrNull(r: Row, p: string): UserChip | null {
  return r[`${p}_id`] === null || r[`${p}_id`] === undefined ? null : chip(r, p);
}

function numOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

async function ctx(viewer: Viewer) {
  if (!hasRole(viewer, "moderator")) throw new Error("Moderation reads need the moderator role.");
  const c = await readCtx(viewer);
  if (c.viewerId === null) throw new Error("Moderation reads need a signed-in staff login.");
  return c.login;
}

/** The viewer's IANA timezone, for absolute times. */
export async function getViewerTimezone(viewer: Viewer): Promise<string> {
  const login = await ctx(viewer);
  const rows = await queryAs<{ timezone: string }>(login, "SELECT timezone FROM users WHERE user_id = ?", [viewer.userId]);
  return rows[0]?.timezone ?? "UTC";
}

// ---- overview

export interface ModOverview {
  open: number;
  reviewing: number;
  mine: number;
  activeSanctions: number;
  endingSoon: number;
}

export async function getModOverview(viewer: Viewer): Promise<ModOverview> {
  const login = await ctx(viewer);
  const [r] = await queryAs<Row>(
    login,
    `SELECT
       (SELECT COUNT(*) FROM report WHERE status = 'open') AS open_n,
       (SELECT COUNT(*) FROM report WHERE status = 'reviewing') AS reviewing_n,
       (SELECT COUNT(*) FROM report WHERE status = 'reviewing' AND handled_by = ?) AS mine_n,
       (SELECT COUNT(*) FROM sanction s WHERE ${ACTIVE_EXPR}) AS active_n,
       (SELECT COUNT(*) FROM sanction s WHERE ${ACTIVE_EXPR}
          AND s.ends_at IS NOT NULL AND s.ends_at <= UTC_TIMESTAMP() + INTERVAL 24 HOUR) AS soon_n`,
    [viewer.userId],
  );
  return {
    open: Number(r?.open_n ?? 0),
    reviewing: Number(r?.reviewing_n ?? 0),
    mine: Number(r?.mine_n ?? 0),
    activeSanctions: Number(r?.active_n ?? 0),
    endingSoon: Number(r?.soon_n ?? 0),
  };
}

// ---- reports

const REPORT_SELECT = `r.report_id, r.category, r.status, r.session_id, r.message_id, r.created_at, r.resolved_at,
  ${chipCols("rp", "rp")}, ${chipCols("rd", "rd")}, ${chipCols("h", "h")}`;
const REPORT_FROM = `FROM report r
  JOIN users rp ON rp.user_id = r.reporter_id
  JOIN users rd ON rd.user_id = r.reported_user_id
  LEFT JOIN users h ON h.user_id = r.handled_by`;

function toReport(r: Row): ReportRow {
  return {
    reportId: Number(r.report_id),
    category: r.category as ReportCategory,
    status: r.status as ReportStatus,
    reporter: chip(r, "rp"),
    reported: chip(r, "rd"),
    sessionId: numOrNull(r.session_id),
    messageId: numOrNull(r.message_id),
    handledBy: chipOrNull(r, "h"),
    createdAt: toIso(r.created_at) ?? "",
    resolvedAt: toIso(r.resolved_at),
  };
}

export interface ReportPage {
  rows: ReportRow[];
  /** report_id to pass as `after` for the next page, or null on the last page */
  nextAfter: number | null;
}

/** Oldest first, keyset by report_id. */
export async function listReports(viewer: Viewer, f: ReportFilters): Promise<ReportPage> {
  const login = await ctx(viewer);
  const where: string[] = [];
  const params: SqlParam[] = [];
  if (f.after !== null) {
    where.push("r.report_id > ?");
    params.push(f.after);
  }
  const statuses = statusesFor(f.status);
  if (statuses) {
    where.push(`r.status IN (${statuses.map(() => "?").join(",")})`);
    params.push(...statuses);
  }
  if (f.category !== "all") {
    where.push("r.category = ?");
    params.push(f.category);
  }
  params.push(MOD_LIMITS.pageSize + 1);
  const rows = await queryAs<Row>(
    login,
    `SELECT ${REPORT_SELECT} ${REPORT_FROM}
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY r.report_id ASC LIMIT ?`,
    params,
  );
  const page = rows.slice(0, MOD_LIMITS.pageSize).map(toReport);
  const more = rows.length > MOD_LIMITS.pageSize;
  return { rows: page, nextAfter: more ? (page[page.length - 1]?.reportId ?? null) : null };
}

export interface PartyCard {
  chip: UserChip;
  trustScore: number;
  reportsAgainst: number;
  reportsFiled: number;
  sanctions: number;
}

export interface EvidenceMessage {
  messageId: number;
  sender: UserChip;
  content: string;
  sentAt: string;
  hidden: boolean;
  isReported: boolean;
}

export interface ReportDetail {
  report: ReportRow;
  description: string | null;
  reporter: PartyCard;
  reported: PartyCard;
  /** null when no message was attached or it no longer exists */
  message: EvidenceMessage | null;
  /** up to 10 lines around the reported message, oldest first, including the reported line itself */
  context: EvidenceMessage[];
  sanctions: SanctionRow[];
  audit: AuditRow[];
}

async function partyCard(login: DbLogin, userId: number, reportId: number): Promise<PartyCard | null> {
  const [r] = await queryAs<Row>(
    login,
    `SELECT ${chipCols("u", "u")}, u.trust_score,
       (SELECT COUNT(*) FROM report x WHERE x.reported_user_id = u.user_id AND x.report_id < ?) AS against_n,
       (SELECT COUNT(*) FROM report x WHERE x.reporter_id = u.user_id AND x.report_id < ?) AS filed_n,
       (SELECT COUNT(*) FROM sanction s WHERE s.user_id = u.user_id) AS sanction_n
     FROM users u WHERE u.user_id = ?`,
    [reportId, reportId, userId],
  );
  if (!r) return null;
  return {
    chip: chip(r, "u"),
    trustScore: Number(r.trust_score ?? 0),
    reportsAgainst: Number(r.against_n),
    reportsFiled: Number(r.filed_n),
    sanctions: Number(r.sanction_n),
  };
}

const MSG_SELECT = `m.message_id, m.sender_id, m.content, m.sent_at, m.is_deleted, m.session_id, m.receiver_id, ${chipCols("u", "s")}`;

function toEvidence(r: Row, reportedId: number): EvidenceMessage {
  const id = Number(r.message_id);
  return {
    messageId: id,
    sender: chip(r, "s"),
    content: String(r.content ?? ""),
    sentAt: toIso(r.sent_at) ?? "",
    hidden: Boolean(Number(r.is_deleted)),
    isReported: id === reportedId,
  };
}

export async function getReportDetail(viewer: Viewer, reportId: number): Promise<ReportDetail | null> {
  const login = await ctx(viewer);
  const [row] = await queryAs<Row>(login, `SELECT ${REPORT_SELECT}, r.description ${REPORT_FROM} WHERE r.report_id = ?`, [reportId]);
  if (!row) return null;
  const report = toReport(row);

  const [reporter, reported] = await Promise.all([
    partyCard(login, report.reporter.userId, reportId),
    partyCard(login, report.reported.userId, reportId),
  ]);
  if (!reporter || !reported) return null;

  // the reported message (shown even when hidden) and its surroundings: that session chat or that DM pair only
  let message: EvidenceMessage | null = null;
  let context: EvidenceMessage[] = [];
  if (report.messageId !== null) {
    const [m] = await queryAs<Row>(login, `SELECT ${MSG_SELECT} FROM message m JOIN users u ON u.user_id = m.sender_id WHERE m.message_id = ?`, [report.messageId]);
    if (m) {
      message = toEvidence(m, report.messageId);
      let scope: string;
      let scopeParams: SqlParam[];
      if (m.session_id !== null && m.session_id !== undefined) {
        scope = "m.session_id = ?";
        scopeParams = [Number(m.session_id)];
      } else {
        const a = Number(m.sender_id);
        const b = Number(m.receiver_id);
        scope = "m.session_id IS NULL AND ((m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?))";
        scopeParams = [a, b, b, a];
      }
      const [before, after] = await Promise.all([
        queryAs<Row>(
          login,
          `SELECT ${MSG_SELECT} FROM message m JOIN users u ON u.user_id = m.sender_id
            WHERE ${scope} AND m.message_id < ? ORDER BY m.message_id DESC LIMIT 6`,
          [...scopeParams, report.messageId],
        ),
        queryAs<Row>(
          login,
          `SELECT ${MSG_SELECT} FROM message m JOIN users u ON u.user_id = m.sender_id
            WHERE ${scope} AND m.message_id > ? ORDER BY m.message_id ASC LIMIT 3`,
          [...scopeParams, report.messageId],
        ),
      ]);
      context = [...before.reverse().map((r) => toEvidence(r, report.messageId!)), message, ...after.map((r) => toEvidence(r, report.messageId!))];
    }
  }

  const sanctions = await queryAs<Row>(login, `${SANCTION_SELECT} WHERE s.report_id = ? ORDER BY s.sanction_id DESC`, [reportId]);
  const sanctionIds = sanctions.map((s) => String(s.sanction_id));

  // the report's own history, the sanctions it led to, and moderation of its message
  const clauses = ["(a.entity = 'report' AND a.entity_id = ?)"];
  const auditParams: SqlParam[] = [String(reportId)];
  if (sanctionIds.length > 0) {
    clauses.push(`(a.entity = 'sanction' AND a.entity_id IN (${sanctionIds.map(() => "?").join(",")}))`);
    auditParams.push(...sanctionIds);
  }
  if (report.messageId !== null) {
    clauses.push("(a.entity = 'message' AND a.entity_id = ?)");
    auditParams.push(String(report.messageId));
  }
  const audit = await queryAs<Row>(login, `${AUDIT_SELECT} WHERE ${clauses.join(" OR ")} ORDER BY a.log_id ASC LIMIT 100`, auditParams);

  return {
    report,
    description: row.description === null || row.description === undefined ? null : String(row.description),
    reporter,
    reported,
    message,
    context,
    sanctions: sanctions.map(toSanction),
    audit: audit.map(toAudit),
  };
}

// ---- sanctions

const SANCTION_SELECT = `SELECT s.sanction_id, s.sanction_type, s.reason, s.report_id, s.starts_at, s.ends_at,
  ${ACTIVE_EXPR} AS is_active, ${chipCols("u", "u")}, ${chipCols("i", "i")}
  FROM sanction s JOIN users u ON u.user_id = s.user_id JOIN users i ON i.user_id = s.issued_by`;

function toSanction(r: Row): SanctionRow {
  return {
    sanctionId: Number(r.sanction_id),
    user: chip(r, "u"),
    type: r.sanction_type as SanctionType,
    reason: String(r.reason ?? ""),
    issuedBy: chip(r, "i"),
    reportId: numOrNull(r.report_id),
    startsAt: toIso(r.starts_at) ?? "",
    endsAt: toIso(r.ends_at),
    active: Boolean(Number(r.is_active)),
  };
}

export interface SanctionPage {
  rows: SanctionRow[];
  /** sanction_id to pass as `before` for the next page, or null on the last page */
  nextBefore: number | null;
}

/** Newest first, keyset by sanction_id. Ended = had an end date that has passed. */
export async function listSanctions(viewer: Viewer, f: SanctionFilters): Promise<SanctionPage> {
  const login = await ctx(viewer);
  const where: string[] = [];
  const params: SqlParam[] = [];
  if (f.before !== null) {
    where.push("s.sanction_id < ?");
    params.push(f.before);
  }
  if (f.tab === "active") where.push(ACTIVE_EXPR);
  if (f.tab === "ended") where.push("(s.ends_at IS NOT NULL AND s.ends_at <= UTC_TIMESTAMP())");
  params.push(MOD_LIMITS.pageSize + 1);
  const rows = await queryAs<Row>(
    login,
    `${SANCTION_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY s.sanction_id DESC LIMIT ?`,
    params,
  );
  const page = rows.slice(0, MOD_LIMITS.pageSize).map(toSanction);
  const more = rows.length > MOD_LIMITS.pageSize;
  return { rows: page, nextBefore: more ? (page[page.length - 1]?.sanctionId ?? null) : null };
}

// ---- audit

const AUDIT_SELECT = `SELECT a.log_id, a.entity, a.entity_id, a.action, a.old_value, a.new_value, a.logged_at,
  ${chipCols("x", "x")}
  FROM audit_log a LEFT JOIN users x ON x.user_id = a.actor_id`;

function json(v: unknown): Record<string, unknown> | null {
  if (v === null || v === undefined) return null;
  let value: unknown = v;
  if (typeof v === "string") {
    try {
      value = JSON.parse(v);
    } catch {
      return { value: v };
    }
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) return { ...(value as Record<string, unknown>) };
  return { value };
}

function toAudit(r: Row): AuditRow {
  return {
    logId: Number(r.log_id),
    actor: chipOrNull(r, "x"),
    entity: String(r.entity),
    entityId: String(r.entity_id),
    action: String(r.action),
    oldValue: json(r.old_value),
    newValue: json(r.new_value),
    loggedAt: toIso(r.logged_at) ?? "",
  };
}

export interface AuditPage {
  rows: AuditRow[];
  /** log_id to pass as `before` for the next page, or null on the last page */
  nextBefore: number | null;
}

/** Newest first, keyset by log_id. Dates are UTC calendar days, inclusive. */
export async function listAudit(viewer: Viewer, f: AuditFilters): Promise<AuditPage> {
  const login = await ctx(viewer);
  const where: string[] = [];
  const params: SqlParam[] = [];
  if (f.before !== null) {
    where.push("a.log_id < ?");
    params.push(f.before);
  }
  if (f.entity) {
    where.push("a.entity = ?");
    params.push(f.entity);
  }
  if (f.action) {
    where.push("a.action = ?");
    params.push(f.action);
  }
  if (f.actor) {
    where.push("x.username = ?");
    params.push(f.actor);
  }
  if (f.from) {
    where.push("a.logged_at >= ?");
    params.push(`${f.from} 00:00:00`);
  }
  if (f.to) {
    where.push("a.logged_at < DATE_ADD(?, INTERVAL 1 DAY)");
    params.push(`${f.to} 00:00:00`);
  }
  params.push(MOD_LIMITS.pageSize + 1);
  const rows = await queryAs<Row>(
    login,
    `${AUDIT_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY a.log_id DESC LIMIT ?`,
    params,
  );
  const page = rows.slice(0, MOD_LIMITS.pageSize).map(toAudit);
  const more = rows.length > MOD_LIMITS.pageSize;
  return { rows: page, nextBefore: more ? (page[page.length - 1]?.logId ?? null) : null };
}

/** Entities and actions seen in the log, to suggest in the filter form. */
export async function listAuditVocabulary(viewer: Viewer): Promise<{ entities: string[]; actions: string[] }> {
  const login = await ctx(viewer);
  const [entities, actions] = await Promise.all([
    queryAs<Row>(login, "SELECT DISTINCT entity AS v FROM audit_log ORDER BY entity LIMIT 50"),
    queryAs<Row>(login, "SELECT DISTINCT action AS v FROM audit_log ORDER BY action LIMIT 50"),
  ]);
  return { entities: entities.map((r) => String(r.v)), actions: actions.map((r) => String(r.v)) };
}
