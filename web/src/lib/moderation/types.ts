// CONTRACT for Phase 6 moderation, shared by database/12_moderation.sql, the server actions under
// src/app/(hearth)/mod/**, src/app/(hearth)/admin/users/** and src/app/(hearth)/report/**, the loaders
// (src/lib/queries-mod.ts, src/lib/queries-admin.ts) and the UI (src/components/mod/**, admin/**, report/**).
// Types and constants only: client-safe. Do not edit without the orchestrator.

export const REPORT_CATEGORIES = ["harassment", "cheating", "spam", "no_show", "other"] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_STATUSES = ["open", "reviewing", "actioned", "dismissed"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const SANCTION_TYPES = ["warn", "mute", "suspend", "ban"] as const;
export type SanctionType = (typeof SANCTION_TYPES)[number];

/** Durations offered for mute and suspend, in days. warn and ban take no end date. */
export const SANCTION_DAYS = [1, 3, 7, 30] as const;

export const ROLE_NAMES = ["player", "moderator", "admin"] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export const MOD_LIMITS = {
  reportDescription: 1000,
  resolveNote: 500,
  sanctionReasonMin: 3,
  sanctionReasonMax: 255,
  liftReasonMax: 255,
  maxSanctionDays: 90,
  pageSize: 25,
} as const;

/** Returned by every moderation / admin / report action. */
export interface ModFormState {
  status: "idle" | "saved" | "error";
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}
export const INITIAL_MOD_STATE: ModFormState = { status: "idle" };

/*
 * STORED PROCEDURES (database/12_moderation.sql). All DEFINER, actor first, SQLSTATE 45000 with a readable
 * message on every refusal, own transaction. Datetimes are UTC. Procedures that create a row return its id
 * through an OUT parameter (web: CALL ... @pd_x inside transactionAs, then SELECT @pd_x, as in
 * src/lib/mutations/sessions.ts).
 *
 *   sp_report_user(p_actor_id, p_reported_id, p_category, p_description, p_session_id, p_message_id, OUT p_report_id)
 *       EXECUTE: pairadice_player (moderator inherits; admin has all). description may be NULL/empty.
 *   sp_my_reports(p_actor_id)
 *       result set: report_id, reported_user_id, reported_username, category, status, created_at, resolved_at
 *       ('actioned' and 'dismissed' are both shown to players as "resolved"; never the handler or sanction)
 *   sp_claim_report(p_actor_id, p_report_id)                                  moderator
 *   sp_resolve_report(p_actor_id, p_report_id, p_outcome, p_note)             moderator; outcome 'dismissed' | 'actioned'
 *   sp_issue_sanction(p_actor_id, p_user_id, p_type, p_reason, p_ends_at, p_report_id, OUT p_sanction_id)  moderator
 *       p_ends_at NULL for warn/ban; required, future and <= 90 days for mute/suspend.
 *       If p_report_id is given the report is marked 'actioned' in the same transaction.
 *   sp_lift_sanction(p_actor_id, p_sanction_id, p_reason)                     moderator (ban needs user.ban)
 *   sp_moderate_message(p_actor_id, p_message_id, p_hide BOOLEAN, p_report_id) moderator; p_report_id may be NULL
 *   sp_grant_role(p_actor_id, p_user_id, p_role_name)                         admin
 *   sp_revoke_role(p_actor_id, p_user_id, p_role_name)                        admin
 *   sp_expire_sanctions()                                                     moderator (exists in 02)
 *   fn_staff_rank(p_user_id) -> 0 player, 1 moderator, 2 admin
 *
 * Reads for /mod and /admin pages are plain SELECTs through readCtx(viewer) (moderator/admin login, which
 * holds SELECT on report, sanction, audit_log, users, message). Lift is recorded in audit_log as
 * entity 'sanction', action 'lift'; message moderation as entity 'message', action 'hide' | 'restore';
 * role revoke as entity 'user_role', action 'revoke'; resolve note in the 'report' status_change row's new_value.
 *
 * A sanction is ACTIVE when its type is mute/suspend/ban (a warning is only on record) and starts_at <= UTC_TIMESTAMP() AND (ends_at IS NULL OR ends_at > UTC_TIMESTAMP()).
 *
 * FORM FIELD NAMES (all ids are decimal strings):
 *   reportUser:      reportedId, category, description, session ("" = none), message ("" = none), back
 *   claimReport:     reportId
 *   resolveReport:   reportId, outcome, note
 *   issueSanction:   userId, type, days ("" for warn/ban), reason, reportId ("" = none), confirm ("yes" for suspend/ban)
 *   liftSanction:    sanctionId, reason
 *   moderateMessage: messageId, hide ("1" hide, "0" restore), reportId ("" = none)
 *   grantRole:       userId, role
 *   revokeRole:      userId, role
 */

export interface UserChip {
  userId: number;
  username: string;
  displayName: string;
  status: "active" | "suspended" | "banned";
}

export interface ReportRow {
  reportId: number;
  category: ReportCategory;
  status: ReportStatus;
  reporter: UserChip;
  reported: UserChip;
  sessionId: number | null;
  messageId: number | null;
  handledBy: UserChip | null;
  createdAt: string; // ISO UTC
  resolvedAt: string | null;
}

export interface SanctionRow {
  sanctionId: number;
  user: UserChip;
  type: SanctionType;
  reason: string;
  issuedBy: UserChip;
  reportId: number | null;
  startsAt: string;
  endsAt: string | null; // null = permanent
  active: boolean;
}

export interface AuditRow {
  logId: number;
  actor: UserChip | null; // null = system
  entity: string;
  entityId: string;
  action: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  loggedAt: string;
}
