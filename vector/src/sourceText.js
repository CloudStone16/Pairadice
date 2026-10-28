// Loads embedding sources from MySQL and turns them into deterministic text + filter fields.
// Only interest signals go into the text (bio, tags, games/modes/roles, session title/description).
// Rank, region, languages, availability and rating are scored by SQL, so they are filter fields only.
import { createHash } from 'node:crypto';
import { sql } from './db.js';
import { config } from './config.js';

const BIO_MAX = 600;          // MiniLM reads ~256 tokens; keep room for tags and games

export const hashText = (text) => createHash('sha256').update(`${config.model.name}\n${text}`).digest('hex');

const list = (xs) => xs.filter(Boolean).join(', ');
const groupBy = (rows, key) => rows.reduce((m, r) => m.set(r[key], [...(m.get(r[key]) ?? []), r]), new Map());
const inList = (ids) => (ids ? 'IN (?)' : 'IS NOT NULL');
const args = (ids) => (ids ? [ids] : []);

/** Players eligible for an embedding (everyone except banned). ids = null loads all. */
export async function loadPlayers(ids = null) {
  if (ids && ids.length === 0) return new Map();
  const db = sql();
  const [users] = await db.query(
    `SELECT user_id, username, bio, status, home_region_id, avg_rating
       FROM users WHERE status <> 'banned' AND user_id ${inList(ids)}`, args(ids));
  if (users.length === 0) return new Map();
  const uids = users.map((u) => u.user_id);
  const [[tags], [langs], [games], [modes], [roles]] = await Promise.all([
    db.query(`SELECT ut.user_id, t.tag_id, t.name FROM user_tag ut JOIN tag t ON t.tag_id = ut.tag_id
               WHERE ut.user_id IN (?) ORDER BY t.name`, [uids]),
    db.query(`SELECT user_id, language_code FROM user_language WHERE user_id IN (?) ORDER BY language_code`, [uids]),
    db.query(`SELECT p.profile_id, p.user_id, p.game_id, g.name AS game, pa.platform_id, p.is_main
                FROM player_game_profile p JOIN game g ON g.game_id = p.game_id
                LEFT JOIN platform_account pa ON pa.account_id = p.platform_account_id
               WHERE p.user_id IN (?) ORDER BY p.user_id, p.is_main DESC, g.name, p.profile_id`, [uids]),
    db.query(`SELECT pm.profile_id, gm.name FROM profile_mode pm JOIN game_mode gm ON gm.mode_id = pm.mode_id
                JOIN player_game_profile p ON p.profile_id = pm.profile_id
               WHERE p.user_id IN (?) AND pm.is_preferred ORDER BY gm.name`, [uids]),
    db.query(`SELECT pr.profile_id, gr.name FROM profile_role pr JOIN game_role gr ON gr.game_role_id = pr.game_role_id
                JOIN player_game_profile p ON p.profile_id = pr.profile_id
               WHERE p.user_id IN (?) ORDER BY pr.preference_order, gr.name`, [uids]),
  ]);
  const tagsBy = groupBy(tags, 'user_id'), langsBy = groupBy(langs, 'user_id'), gamesBy = groupBy(games, 'user_id');
  const modesBy = groupBy(modes, 'profile_id'), rolesBy = groupBy(roles, 'profile_id');

  const out = new Map();
  for (const u of users) {
    const myTags = tagsBy.get(u.user_id) ?? [];
    const myGames = gamesBy.get(u.user_id) ?? [];
    // one player can have several profiles for a game (one per platform): merge them by game
    const perGame = new Map();
    for (const p of myGames) {
      const g = perGame.get(p.game) ?? { modes: new Set(), roles: new Set() };
      (modesBy.get(p.profile_id) ?? []).forEach((m) => g.modes.add(m.name));
      (rolesBy.get(p.profile_id) ?? []).forEach((r) => g.roles.add(r.name));
      perGame.set(p.game, g);
    }
    const gameText = [...perGame].map(([game, g]) => {
      const detail = list([[...g.modes].join(', '), g.roles.size ? `plays ${[...g.roles].join(', ')}` : '']);
      return detail ? `${game} (${detail})` : game;
    });
    const parts = [];
    if (u.bio) parts.push(u.bio.trim().slice(0, BIO_MAX));
    if (myTags.length) parts.push(`Vibe: ${myTags.map((t) => t.name).join(', ')}.`);
    if (gameText.length) parts.push(`Plays ${gameText.join('; ')}.`);
    const text = parts.join(' ') || `Player ${u.username}.`;

    out.set(u.user_id, {
      text,
      fields: {
        user_id: u.user_id,
        username: u.username,
        status: u.status,
        game_ids: [...new Set(myGames.map((p) => p.game_id))],
        platform_ids: [...new Set(myGames.map((p) => p.platform_id).filter((x) => x != null))],
        language_codes: (langsBy.get(u.user_id) ?? []).map((l) => l.language_code),
        tag_ids: myTags.map((t) => t.tag_id),
        region_id: u.home_region_id,
        avg_rating: u.avg_rating,
      },
    });
  }
  return out;
}

/** Sessions eligible for an embedding (not completed / cancelled). ids = null loads all. */
export async function loadSessions(ids = null) {
  if (ids && ids.length === 0) return new Map();
  const db = sql();
  const [sessions] = await db.query(
    `SELECT s.session_id, s.host_id, s.game_id, g.name AS game, s.mode_id, gm.name AS game_mode, s.platform_id,
            s.region_id, s.region_locked, s.visibility, s.status, s.title, s.description
       FROM lfg_session s JOIN game g ON g.game_id = s.game_id JOIN game_mode gm ON gm.mode_id = s.mode_id
      WHERE s.status IN ('open','full','in_progress') AND s.session_id ${inList(ids)}`, args(ids));
  if (sessions.length === 0) return new Map();
  const sids = sessions.map((s) => s.session_id);
  const [[tags], [langs], [slots]] = await Promise.all([
    db.query(`SELECT st.session_id, t.tag_id, t.name FROM session_tag st JOIN tag t ON t.tag_id = st.tag_id
               WHERE st.session_id IN (?) ORDER BY t.name`, [sids]),
    db.query(`SELECT session_id, language_code FROM session_language WHERE session_id IN (?) ORDER BY language_code`, [sids]),
    db.query(`SELECT ss.session_id, ss.game_role_id, gr.name, ss.slots_needed FROM session_slot ss
                JOIN game_role gr ON gr.game_role_id = ss.game_role_id
               WHERE ss.session_id IN (?) ORDER BY ss.slot_no`, [sids]),
  ]);
  const tagsBy = groupBy(tags, 'session_id'), langsBy = groupBy(langs, 'session_id'), slotsBy = groupBy(slots, 'session_id');

  const out = new Map();
  for (const s of sessions) {
    const myTags = tagsBy.get(s.session_id) ?? [];
    const mySlots = slotsBy.get(s.session_id) ?? [];
    const parts = [`${s.title.trim()}.`];
    if (s.description) parts.push(s.description.trim().slice(0, BIO_MAX));
    parts.push(`${s.game} ${s.game_mode}.`);
    if (myTags.length) parts.push(`Vibe: ${myTags.map((t) => t.name).join(', ')}.`);
    if (mySlots.length) parts.push(`Looking for ${mySlots.map((x) => `${x.slots_needed} ${x.name}`).join(', ')}.`);

    out.set(s.session_id, {
      text: parts.join(' '),
      fields: {
        session_id: s.session_id,
        host_id: s.host_id,
        status: s.status,
        visibility: s.visibility,
        game_id: s.game_id,
        mode_id: s.mode_id,
        platform_id: s.platform_id,
        region_id: s.region_id,
        region_locked: Boolean(s.region_locked),
        language_codes: (langsBy.get(s.session_id) ?? []).map((l) => l.language_code),
        tag_ids: myTags.map((t) => t.tag_id),
        needed_role_ids: [...new Set(mySlots.map((x) => x.game_role_id))],
      },
    });
  }
  return out;
}
