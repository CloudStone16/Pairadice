import "server-only";
import { cache } from "react";
import { query } from "@/lib/db";
import { CAN_VIEW_CAMP, bool, str } from "@/lib/sql-parts";
import type {
  Camp,
  ChatMessage,
  PartyEntry,
  PartyRole,
  PlayerBadge,
  PlayerCard,
  PlayerGame,
  PlayerLanguage,
  RosterEntry,
  SlotNeed,
} from "@/lib/types";

// Read-only queries for the camp (session) page, party list and character sheet.
// Gamertags come exclusively from v_session_roster and, like the chat log, are
// only ever returned to the host or an accepted participant of that camp.
// platform_account / auth_* tables are never touched.

/** Most recent chat lines returned for a camp. */
export const CHAT_LIMIT = 200;
/** Cap on the "My Party" list. */
export const PARTY_LIMIT = 100;

// ---------------------------------------------------------------- camp
interface CampRow extends Omit<Camp, "region_locked" | "voice_required" | "min_avg_rating"> {
  region_locked: unknown;
  voice_required: unknown;
  min_avg_rating: unknown;
}

/**
 * One session by id (any status). Returns null if it does not exist or the
 * viewer may not see it (friends-only / invite-only without access). Invited
 * guests get in only while their roster status is accepted or requested.
 */
export const getCamp = cache(async (sessionId: number, viewerId: number): Promise<Camp | null> => {
  const rows = await query<CampRow>(
    `SELECT s.session_id, s.title, s.description, s.status, s.max_players, s.current_players,
            s.scheduled_start, s.region_locked, s.voice_required, s.visibility, s.join_policy,
            s.min_avg_rating, s.discord_invite_url, s.host_id,
            h.username AS host_username, h.status AS host_status,
            g.name AS game, g.slug AS game_slug, gm.name AS game_mode,
            r.code AS region_code, r.name AS region_name,
            minr.name AS min_rank, maxr.name AS max_rank
       FROM lfg_session s
       JOIN game g       ON g.game_id = s.game_id
       JOIN game_mode gm ON gm.mode_id = s.mode_id
       JOIN users h      ON h.user_id = s.host_id
       LEFT JOIN geo_region r   ON r.region_id = s.region_id
       LEFT JOIN rank_tier minr ON minr.rank_id = s.min_rank_id
       LEFT JOIN rank_tier maxr ON maxr.rank_id = s.max_rank_id
      WHERE s.session_id = ? AND ${CAN_VIEW_CAMP}`,
    [sessionId, viewerId, viewerId, viewerId, viewerId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    ...r,
    host_status: String(r.host_status),
    min_avg_rating: r.min_avg_rating === null ? null : Number(r.min_avg_rating),
    region_locked: bool(r.region_locked),
    voice_required: bool(r.voice_required),
  };
});

/**
 * True when the viewer is the host or an accepted participant of the camp.
 * Only these viewers may see gamertags and the chat log.
 */
export const isCampMember = cache(async (sessionId: number, viewerId: number): Promise<boolean> => {
  const rows = await query<{ is_member: unknown }>(
    `SELECT EXISTS (
              SELECT 1 FROM lfg_session s
               WHERE s.session_id = ?
                 AND (s.host_id = ?
                      OR EXISTS (SELECT 1 FROM v_session_roster rm
                                  WHERE rm.session_id = s.session_id AND rm.user_id = ?
                                    AND rm.status = 'accepted'))
            ) AS is_member`,
    [sessionId, viewerId, viewerId],
  );
  return bool(rows[0]?.is_member);
});

interface RosterRow extends Omit<RosterEntry, "gamertag" | "identity_label"> {
  gamertag: unknown;
  identity_label: unknown;
}

/**
 * Everyone on a camp's roster. Empty when the viewer may not see the camp;
 * gamertags / identity labels are filled in only for members viewing accepted seats.
 */
export async function getRoster(sessionId: number, viewerId: number): Promise<RosterEntry[]> {
  const member = (await isCampMember(sessionId, viewerId)) ? 1 : 0;
  const rows = await query<RosterRow>(
    `SELECT r.user_id, r.username, u.display_name, r.status, r.game_role,
            CASE WHEN ? = 1 AND r.status = 'accepted' THEN r.gamertag ELSE NULL END AS gamertag,
            CASE WHEN ? = 1 AND r.status = 'accepted' THEN r.identity_label ELSE NULL END AS identity_label,
            r.left_at
       FROM v_session_roster r
       JOIN users u ON u.user_id = r.user_id
       JOIN lfg_session s ON s.session_id = r.session_id
      WHERE r.session_id = ? AND ${CAN_VIEW_CAMP}
      ORDER BY r.joined_at, r.user_id`,
    [member, member, sessionId, viewerId, viewerId, viewerId, viewerId],
  );
  return rows.map((r) => ({ ...r, gamertag: str(r.gamertag), identity_label: str(r.identity_label) }));
}

export async function getSlotNeeds(sessionId: number): Promise<SlotNeed[]> {
  return query<SlotNeed>(
    `SELECT ss.slots_needed, gr.name AS role
       FROM session_slot ss
       JOIN game_role gr ON gr.game_role_id = ss.game_role_id
      WHERE ss.session_id = ?
      ORDER BY ss.slot_no`,
    [sessionId],
  );
}

export async function getSessionLanguages(sessionId: number): Promise<string[]> {
  const rows = await query<{ language_code: string }>(
    `SELECT sl.language_code FROM session_language sl WHERE sl.session_id = ? ORDER BY sl.language_code`,
    [sessionId],
  );
  return rows.map((r) => r.language_code);
}

export async function getSessionTags(sessionId: number): Promise<string[]> {
  const rows = await query<{ name: string }>(
    `SELECT t.name FROM session_tag st JOIN tag t ON t.tag_id = st.tag_id
      WHERE st.session_id = ? ORDER BY t.name`,
    [sessionId],
  );
  return rows.map((r) => r.name);
}

interface ChatRow extends Omit<ChatMessage, "is_deleted"> {
  is_deleted: unknown;
}

/**
 * The latest CHAT_LIMIT chat lines, oldest first. Returns null (locked) unless
 * the viewer is the host or an accepted participant. Deleted bodies are never fetched.
 */
export async function getSessionChat(sessionId: number, viewerId: number): Promise<ChatMessage[] | null> {
  if (!(await isCampMember(sessionId, viewerId))) return null;
  const rows = await query<ChatRow>(
    `SELECT t.message_id, t.sender_id, t.username, t.display_name, t.content, t.is_deleted, t.sent_at, t.edited_at
       FROM (
         SELECT m.message_id, m.sender_id, u.username, u.display_name,
                IF(m.is_deleted, NULL, m.content) AS content, m.is_deleted, m.sent_at, m.edited_at
           FROM message m
           JOIN users u ON u.user_id = m.sender_id
          WHERE m.session_id = ?
          ORDER BY m.sent_at DESC, m.message_id DESC
          LIMIT ${CHAT_LIMIT}
       ) t
      ORDER BY t.sent_at ASC, t.message_id ASC`,
    [sessionId],
  );
  return rows.map((r) => ({ ...r, content: str(r.content), is_deleted: bool(r.is_deleted) }));
}

// ---------------------------------------------------------------- party
type PartyRow = Omit<PartyEntry, "role"> & {
  host_id: number;
  my_status: string | null;
};

/** Sessions the user hosts, is accepted in, or has requested to join (max PARTY_LIMIT). */
export async function getMyParty(userId: number): Promise<PartyEntry[]> {
  const rows = await query<PartyRow>(
    `SELECT s.session_id, s.title, s.status, s.host_id, s.scheduled_start, s.current_players, s.max_players,
            g.name AS game, g.slug AS game_slug, gm.name AS game_mode, r.status AS my_status
       FROM lfg_session s
       JOIN game g       ON g.game_id = s.game_id
       JOIN game_mode gm ON gm.mode_id = s.mode_id
       LEFT JOIN v_session_roster r ON r.session_id = s.session_id AND r.user_id = ?
      WHERE s.host_id = ? OR r.status IN ('accepted', 'requested')
      ORDER BY FIELD(s.status, 'open', 'full', 'in_progress', 'completed', 'cancelled'),
               (s.scheduled_start IS NULL), s.scheduled_start, s.session_id
      LIMIT ${PARTY_LIMIT}`,
    [userId, userId],
  );
  return rows.map((r) => {
    const role: PartyRole =
      r.host_id === userId ? "hosting" : r.my_status === "requested" ? "knocking" : "party";
    return {
      session_id: r.session_id,
      role,
      title: r.title,
      status: r.status,
      game: r.game,
      game_slug: r.game_slug,
      game_mode: r.game_mode,
      scheduled_start: r.scheduled_start,
      current_players: r.current_players,
      max_players: r.max_players,
    };
  });
}

// ---------------------------------------------------------------- character
export const getPlayerCard = cache(async (userId: number): Promise<PlayerCard | null> => {
  const rows = await query<Record<keyof PlayerCard, unknown>>(
    `SELECT pc.user_id, pc.username, pc.display_name, pc.home_region, pc.status,
            pc.avg_rating, pc.review_count, pc.sessions_completed, pc.trust_score
       FROM v_player_card pc
      WHERE pc.user_id = ?`,
    [userId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    user_id: Number(r.user_id),
    username: String(r.username),
    display_name: String(r.display_name),
    home_region: str(r.home_region),
    status: String(r.status),
    avg_rating: r.avg_rating === null ? null : Number(r.avg_rating),
    review_count: Number(r.review_count),
    sessions_completed: Number(r.sessions_completed),
    trust_score: Number(r.trust_score),
  };
});

interface GameRow extends Omit<PlayerGame, "rank_ordinal"> {
  rank_ordinal: unknown;
}

/** Games on a player's shelf with their rank, mains first. No in-game names or platform accounts. */
export const getPlayerGames = cache(async (userId: number): Promise<PlayerGame[]> => {
  const rows = await query<GameRow>(
    `SELECT p.profile_id, g.slug AS game_slug, g.name AS game_name,
            rt.name AS rank_name, rt.ordinal AS rank_ordinal
       FROM player_game_profile p
       JOIN game g ON g.game_id = p.game_id
       LEFT JOIN rank_tier rt ON rt.rank_id = p.rank_id
      WHERE p.user_id = ?
      ORDER BY p.is_main DESC, g.name, p.profile_id`,
    [userId],
  );
  // A player may have the same game on several platforms: show each game once, with its best rank.
  const byGame = new Map<string, PlayerGame>();
  for (const row of rows) {
    const next: PlayerGame = { ...row, rank_ordinal: row.rank_ordinal === null ? null : Number(row.rank_ordinal) };
    const seen = byGame.get(next.game_slug);
    if (!seen) {
      byGame.set(next.game_slug, next);
    } else if ((next.rank_ordinal ?? -1) > (seen.rank_ordinal ?? -1)) {
      byGame.set(next.game_slug, { ...next, profile_id: seen.profile_id });
    }
  }
  return [...byGame.values()];
});

export const getPlayerBadges = cache(async (userId: number): Promise<PlayerBadge[]> => {
  return query<PlayerBadge>(
    `SELECT b.badge_id, b.name, b.description
       FROM user_badge ub
       JOIN badge b ON b.badge_id = ub.badge_id
      WHERE ub.user_id = ?
      ORDER BY b.name, b.badge_id`,
    [userId],
  );
});

interface LanguageRow extends Omit<PlayerLanguage, "is_preferred"> {
  is_preferred: unknown;
}

export const getPlayerLanguages = cache(async (userId: number): Promise<PlayerLanguage[]> => {
  const rows = await query<LanguageRow>(
    `SELECT ul.language_code, l.name, ul.proficiency, ul.is_preferred
       FROM user_language ul
       JOIN language l ON l.language_code = ul.language_code
      WHERE ul.user_id = ?
      ORDER BY ul.is_preferred DESC, l.name, ul.language_code`,
    [userId],
  );
  return rows.map((r) => ({ ...r, is_preferred: bool(r.is_preferred) }));
});
