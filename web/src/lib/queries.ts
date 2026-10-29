import "server-only";
import { cache } from "react";
import { callProc, query, type SqlParam } from "@/lib/db";
import { getDevUserId, isDevAuthEnabled, DEFAULT_DEV_USER_ID } from "@/lib/dev-user";
import { splitList } from "@/lib/format";
import { assignModeSlugs, type ModeRow } from "@/lib/slugs";
import {
  NOT_LONG_PAST,
  USER_COLS,
  VISIBLE_TO_VIEWER,
  bool,
  notBlockedWith,
  presenceExpr,
  str,
} from "@/lib/sql-parts";
import type {
  DmThread,
  FriendEntry,
  FriendLists,
  GameInfo,
  ModeInfo,
  Presence,
  Quest,
  QuestFit,
  UserLite,
} from "@/lib/types";

// READ-ONLY data layer: SELECT statements plus `CALL sp_recommend_sessions(?, ?, FALSE)`.
// Sources: v_open_sessions, v_session_roster, v_player_card, game, game_mode,
// rank_tier, game_role, lfg_session, session_slot, session_language, session_tag,
// tag, friendship, user_block, message, geo_region, player_game_profile,
// user_badge, badge, user_language, language and a safe column subset of users.
// Never read: auth_account, auth_token, platform_account, sanction, report, audit_log.

export * from "@/lib/queries-camp";

// ---------------------------------------------------------------- users
interface UserRow {
  user_id: number;
  username: string;
  display_name: string;
  timezone: string;
  trust_score: number;
  presence: Presence;
}

export const getUserById = cache(async (userId: number): Promise<UserLite | null> => {
  const rows = await query<UserRow>(`SELECT ${USER_COLS} FROM users u WHERE u.user_id = ?`, [userId]);
  return rows[0] ?? null;
});

/**
 * The signed-in user, or null when there is no identity (Phase 1 has no real
 * sign-in; the dev "play as" cookie only counts when dev auth is enabled).
 * A stale dev cookie falls back to the default seed user.
 */
export const getCurrentUser = cache(async (): Promise<UserLite | null> => {
  const id = await getDevUserId();
  if (id === null) return null;
  const user = await getUserById(id);
  if (user) return user;
  return id === DEFAULT_DEV_USER_ID ? null : getUserById(DEFAULT_DEV_USER_ID);
});

/** Dev "play as" list. Empty unless dev auth is enabled. */
export const getAllUsers = cache(async (): Promise<Array<{ user_id: number; username: string }>> => {
  if (!isDevAuthEnabled()) return [];
  return query<{ user_id: number; username: string }>(
    `SELECT u.user_id, u.username FROM users u ORDER BY u.user_id`,
  );
});

// ---------------------------------------------------------------- games
export const getGames = cache(async (viewerId: number): Promise<GameInfo[]> => {
  return query<GameInfo>(
    `SELECT g.game_id, g.name, g.slug,
            (SELECT COUNT(*) FROM lfg_session s
               JOIN users h ON h.user_id = s.host_id AND h.status = 'active'
              WHERE s.game_id = g.game_id AND s.status = 'open' AND ${NOT_LONG_PAST} AND ${VISIBLE_TO_VIEWER}) AS open_count
       FROM game g
      WHERE g.is_active = TRUE
      ORDER BY g.name`,
    [viewerId, viewerId, viewerId],
  );
});

export const getModes = cache(async (): Promise<ModeInfo[]> => {
  const rows = await query<ModeRow>(
    `SELECT gm.mode_id, gm.game_id, gm.name, gm.description
       FROM game_mode gm
      ORDER BY gm.game_id, gm.name, gm.mode_id`,
  );
  return assignModeSlugs(rows);
});

// ---------------------------------------------------------------- quests
interface QuestRow {
  session_id: number;
  title: string;
  game: string;
  game_slug: string;
  game_mode: string;
  platform: string;
  host: string;
  host_id: number;
  region: string | null;
  current_players: number;
  max_players: number;
  open_slots: number;
  min_rank: string | null;
  max_rank: string | null;
  languages: unknown;
  tags: unknown;
  looking_for: unknown;
  scheduled_start: string | null;
  voice_required: unknown;
}

/** Hard cap on the board; the UI shows "N+" when it is reached. */
export const OPEN_QUEST_LIMIT = 100;

const QUEST_SELECT = `SELECT v.session_id, v.title, v.game, g.slug AS game_slug, v.game_mode, v.platform,
       v.host, s.host_id, v.region, v.current_players, v.max_players, v.open_slots,
       v.min_rank, v.max_rank, v.languages, v.tags, v.looking_for,
       v.scheduled_start, v.voice_required
  FROM v_open_sessions v
  JOIN lfg_session s ON s.session_id = v.session_id
  JOIN game g ON g.game_id = s.game_id`;

function toQuest({ languages, tags, looking_for, voice_required, ...r }: QuestRow): Quest {
  return {
    ...r,
    languages: splitList(str(languages)),
    tags: splitList(str(tags)),
    looking_for: splitList(str(looking_for)),
    voice_required: bool(voice_required),
  };
}

export interface QuestFilter {
  gameId?: number;
  modeId?: number;
}

/** Open quests visible to `viewerId`, soonest first (unscheduled last), capped at OPEN_QUEST_LIMIT. */
export async function getOpenQuests(viewerId: number, filter: QuestFilter = {}): Promise<Quest[]> {
  const where = [
    `EXISTS (SELECT 1 FROM users h WHERE h.user_id = s.host_id AND h.status = 'active')`,
    NOT_LONG_PAST,
    VISIBLE_TO_VIEWER,
  ];
  const params: SqlParam[] = [viewerId, viewerId, viewerId];
  if (filter.gameId !== undefined) {
    where.push("s.game_id = ?");
    params.push(filter.gameId);
  }
  if (filter.modeId !== undefined) {
    where.push("s.mode_id = ?");
    params.push(filter.modeId);
  }
  const rows = await query<QuestRow>(
    `${QUEST_SELECT}
      WHERE ${where.join(" AND ")}
      ORDER BY (s.scheduled_start IS NULL), s.scheduled_start, s.session_id
      LIMIT ${OPEN_QUEST_LIMIT}`,
    params,
  );
  return rows.map(toQuest);
}

async function getQuestsByIds(ids: number[]): Promise<Quest[]> {
  if (ids.length === 0) return [];
  const rows = await query<QuestRow>(`${QUEST_SELECT} WHERE s.session_id IN (?)`, [ids]);
  return rows.map(toQuest);
}

interface RecRow extends QuestFit {
  session_id: number;
}

/** Top 5 matches from sp_recommend_sessions (p_log = FALSE: nothing is written). Cached per request. */
export const getRecommendedQuests = cache(async (userId: number): Promise<Quest[]> => {
  try {
    return await loadRecommendedQuests(userId);
  } catch (err) {
    // A failing procedure must never take the whole site down; the UI shows its empty state.
    console.error("[pairadice] sp_recommend_sessions failed:", err);
    return [];
  }
});

async function loadRecommendedQuests(userId: number): Promise<Quest[]> {
  const recs = await callProc<RecRow>("CALL sp_recommend_sessions(?, ?, FALSE)", [userId, 5]);
  const quests = await getQuestsByIds(recs.map((r) => r.session_id));
  const byId = new Map(quests.map((q) => [q.session_id, q]));
  const out: Quest[] = [];
  for (const r of recs) {
    const q = byId.get(r.session_id);
    if (!q) continue;
    out.push({
      ...q,
      fit: {
        rank_fit: Number(r.rank_fit),
        avail_fit: Number(r.avail_fit),
        tag_fit: Number(r.tag_fit),
        rating_fit: Number(r.rating_fit),
        social_fit: Number(r.social_fit),
        region_fit: Number(r.region_fit),
      },
    });
  }
  return out;
}

// ---------------------------------------------------------------- friends
async function friendRows(
  userId: number,
  status: "accepted" | "pending",
  direction: "any" | "in" | "out",
): Promise<FriendEntry[]> {
  const cond =
    direction === "in"
      ? "f.addressee_id = ?"
      : direction === "out"
        ? "f.requester_id = ?"
        : "(f.requester_id = ? OR f.addressee_id = ?)";
  const params: SqlParam[] = [userId, status, userId];
  if (direction === "any") params.push(userId);
  params.push(userId, userId); // notBlockedWith(u)
  return query<UserRow>(
    `SELECT ${USER_COLS}
       FROM friendship f
       JOIN users u ON u.user_id = IF(f.requester_id = ?, f.addressee_id, f.requester_id)
      WHERE f.status = ? AND ${cond}
        AND ${notBlockedWith("u")}
      ORDER BY u.display_name, u.user_id`,
    params,
  );
}

export const getFriendLists = cache(async (userId: number): Promise<FriendLists> => {
  const [accepted, incoming, outgoing] = await Promise.all([
    friendRows(userId, "accepted", "any"),
    friendRows(userId, "pending", "in"),
    friendRows(userId, "pending", "out"),
  ]);
  return { accepted, incoming, outgoing };
});

// ---------------------------------------------------------------- direct messages
interface DmRow {
  message_id: number;
  other_id: number;
  other_username: string;
  other_display_name: string;
  other_presence: Presence;
  sender_id: number;
  content: string | null;
  is_deleted: unknown;
  sent_at: string;
}

/** Latest DM per conversation partner, newest first (max 5). */
export async function getRecentDms(userId: number): Promise<DmThread[]> {
  const rows = await query<DmRow>(
    `SELECT t.message_id, t.other_id, u.username AS other_username, u.display_name AS other_display_name,
            ${presenceExpr("u")} AS other_presence,
            t.sender_id, IF(t.is_deleted, NULL, t.content) AS content, t.is_deleted, t.sent_at
       FROM (
         SELECT m.message_id, m.sender_id, m.content, m.sent_at, m.is_deleted,
                IF(m.sender_id = ?, m.receiver_id, m.sender_id) AS other_id,
                ROW_NUMBER() OVER (
                  PARTITION BY IF(m.sender_id = ?, m.receiver_id, m.sender_id)
                  ORDER BY m.sent_at DESC, m.message_id DESC) AS rn
           FROM message m
          WHERE m.session_id IS NULL AND (m.sender_id = ? OR m.receiver_id = ?)
       ) t
       JOIN users u ON u.user_id = t.other_id
      WHERE t.rn = 1
        AND ${notBlockedWith("u")}
      ORDER BY t.sent_at DESC, t.message_id DESC
      LIMIT 5`,
    [userId, userId, userId, userId, userId, userId],
  );
  return rows.map((r) => ({
    message_id: r.message_id,
    other_id: r.other_id,
    other_username: r.other_username,
    other_display_name: r.other_display_name,
    other_presence: r.other_presence,
    sent_by_me: r.sender_id === userId,
    content: bool(r.is_deleted) ? null : str(r.content),
    is_deleted: bool(r.is_deleted),
    sent_at: r.sent_at,
  }));
}
