import "server-only";
import { queryAs } from "@/lib/db";
import { readCtx } from "@/lib/read-login";
import type { Viewer } from "@/lib/auth/viewer";
import { hasRole } from "@/lib/auth/guards";
import { toIso } from "@/lib/moderation/time";
import type { ReportRow, RoleName, SanctionRow, UserChip } from "@/lib/moderation/types";

// Admin reads for /admin/users: plain SELECTs through the viewer's own (admin) login.

export interface AdminUserRow extends UserChip {
  roles: RoleName[];
  activeSanctions: number;
  createdAt: string;
}

export interface AdminUserDetail extends UserChip {
  roles: RoleName[];
  createdAt: string;
  trustScore: number;
  sanctions: SanctionRow[];
  reports: ReportRow[];
}

export const USER_LIST_LIMIT = 50;

// In force = mute, suspend or ban that has started and not ended; a warning (no end date) is not a restriction.
const ACTIVE = "s.sanction_type IN ('mute', 'suspend', 'ban') AND s.starts_at <= UTC_TIMESTAMP() AND (s.ends_at IS NULL OR s.ends_at > UTC_TIMESTAMP())";

const toRoles = (csv: string | null): RoleName[] =>
  (csv ?? "").split(",").filter((r): r is RoleName => r === "player" || r === "moderator" || r === "admin");

function chip(prefix: string, r: Record<string, unknown>): UserChip {
  return {
    userId: Number(r[`${prefix}_id`]),
    username: String(r[`${prefix}_username`]),
    displayName: String(r[`${prefix}_display`]),
    status: r[`${prefix}_status`] as UserChip["status"],
  };
}
function optChip(prefix: string, r: Record<string, unknown>): UserChip | null {
  return r[`${prefix}_id`] === null || r[`${prefix}_id`] === undefined ? null : chip(prefix, r);
}

function likeContains(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

async function adminCtx(viewer: Viewer) {
  if (!hasRole(viewer, "admin")) throw new Error("Admin reads need the admin role.");
  return readCtx(viewer);
}

export async function listAdminUsers(viewer: Viewer, q: string): Promise<AdminUserRow[]> {
  const { login, viewerId } = await adminCtx(viewer);
  if (viewerId === null) return [];
  const term = q.trim().slice(0, 32);
  const where = term === "" ? "" : "WHERE u.username LIKE ? OR u.display_name LIKE ?";
  const params = term === "" ? [] : [likeContains(term), likeContains(term)];
  const rows = await queryAs<Record<string, unknown>>(
    login,
    `SELECT u.user_id, u.username, u.display_name, u.status, u.created_at,
            (SELECT GROUP_CONCAT(r.role_name ORDER BY r.role_id) FROM user_role ur JOIN role r ON r.role_id = ur.role_id
              WHERE ur.user_id = u.user_id) AS roles,
            (SELECT COUNT(*) FROM sanction s WHERE s.user_id = u.user_id AND ${ACTIVE}) AS active_sanctions
       FROM users u ${where}
      ORDER BY u.username LIMIT ${USER_LIST_LIMIT}`,
    params,
  );
  return rows.map((r) => ({
    userId: Number(r.user_id),
    username: String(r.username),
    displayName: String(r.display_name),
    status: r.status as UserChip["status"],
    roles: toRoles((r.roles as string | null) ?? null),
    activeSanctions: Number(r.active_sanctions),
    createdAt: toIso(r.created_at) ?? "",
  }));
}

export async function getAdminUser(viewer: Viewer, userId: number): Promise<AdminUserDetail | null> {
  const { login, viewerId } = await adminCtx(viewer);
  if (viewerId === null) return null;
  const users = await queryAs<Record<string, unknown>>(
    login,
    `SELECT u.user_id, u.username, u.display_name, u.status, u.created_at, u.trust_score,
            (SELECT GROUP_CONCAT(r.role_name ORDER BY r.role_id) FROM user_role ur JOIN role r ON r.role_id = ur.role_id
              WHERE ur.user_id = u.user_id) AS roles
       FROM users u WHERE u.user_id = ?`,
    [userId],
  );
  const u = users[0];
  if (!u) return null;
  const self: UserChip = {
    userId: Number(u.user_id),
    username: String(u.username),
    displayName: String(u.display_name),
    status: u.status as UserChip["status"],
  };

  const [sanctionRows, reportRows] = await Promise.all([
    queryAs<Record<string, unknown>>(
      login,
      `SELECT s.sanction_id, s.sanction_type, s.reason, s.report_id, s.starts_at, s.ends_at,
              (${ACTIVE}) AS active,
              i.user_id AS i_id, i.username AS i_username, i.display_name AS i_display, i.status AS i_status
         FROM sanction s JOIN users i ON i.user_id = s.issued_by
        WHERE s.user_id = ? ORDER BY s.starts_at DESC, s.sanction_id DESC`,
      [userId],
    ),
    queryAs<Record<string, unknown>>(
      login,
      `SELECT rp.report_id, rp.category, rp.status, rp.session_id, rp.message_id, rp.created_at, rp.resolved_at,
              a.user_id AS a_id, a.username AS a_username, a.display_name AS a_display, a.status AS a_status,
              h.user_id AS h_id, h.username AS h_username, h.display_name AS h_display, h.status AS h_status
         FROM report rp JOIN users a ON a.user_id = rp.reporter_id
         LEFT JOIN users h ON h.user_id = rp.handled_by
        WHERE rp.reported_user_id = ? ORDER BY rp.created_at DESC, rp.report_id DESC LIMIT 20`,
      [userId],
    ),
  ]);

  return {
    ...self,
    roles: toRoles((u.roles as string | null) ?? null),
    createdAt: toIso(u.created_at) ?? "",
    trustScore: Number(u.trust_score),
    sanctions: sanctionRows.map((r) => ({
      sanctionId: Number(r.sanction_id),
      user: self,
      type: r.sanction_type as SanctionRow["type"],
      reason: String(r.reason),
      issuedBy: chip("i", r),
      reportId: r.report_id === null ? null : Number(r.report_id),
      startsAt: toIso(r.starts_at) ?? "",
      endsAt: toIso(r.ends_at),
      active: Number(r.active) === 1,
    })),
    reports: reportRows.map((r) => ({
      reportId: Number(r.report_id),
      category: r.category as ReportRow["category"],
      status: r.status as ReportRow["status"],
      reporter: chip("a", r),
      reported: self,
      sessionId: r.session_id === null ? null : Number(r.session_id),
      messageId: r.message_id === null ? null : Number(r.message_id),
      handledBy: optChip("h", r),
      createdAt: toIso(r.created_at) ?? "",
      resolvedAt: toIso(r.resolved_at),
    })),
  };
}
