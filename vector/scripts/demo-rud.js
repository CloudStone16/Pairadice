// Create / Read / Update / Delete walkthrough of the vector store, driven by real MySQL edits.
// Every step goes MySQL row -> trigger -> embedding_outbox -> worker -> MongoDB, exactly as in production.
// It adds a fresh demo player and session each run (then bans / cancels them), so it is safe to repeat.
// Usage: MYSQL_PWD=... node scripts/demo-rud.js
import { closeAll, collections, sql } from '../src/db.js';
import { drainOutbox } from '../src/sync.js';
import { hybridSessions, similarPlayers, similarSessions, waitSearchable } from '../src/search.js';

const db = sql();
const q = async (text, params) => (await db.query(text, params))[0];

const title = (t) => console.log(`\n=== ${t} ${'='.repeat(Math.max(0, 70 - t.length))}`);
const note = (t) => console.log(`--- ${t}`);
const short = ({ embedding, ...d }) => ({
  ...d, embedding: embedding && `[${embedding.slice(0, 3).map((x) => x.toFixed(3)).join(', ')}, … ${embedding.length} dims]`,
});
const round = (v) => (typeof v === 'number' && !Number.isInteger(v) ? Number(v.toFixed(4)) : v);
const table = (rows, cols) => console.table(rows.map((r) => Object.fromEntries(cols.map((c) => [c, round(r[c])]))));

async function outbox() {
  note('embedding_outbox (queued by triggers)');
  table(await q('SELECT entity, entity_id, op, enqueued_at FROM embedding_outbox ORDER BY enqueued_at'),
    ['entity', 'entity_id', 'op', 'enqueued_at']);
}
async function drain() {
  const s = await drainOutbox();
  note(`worker: ${s.rows} row(s); player ${JSON.stringify(s.player)}; session ${JSON.stringify(s.session)}`);
}

async function main() {
  const { players, sessions } = await collections();
  await drain();                                              // start from an empty queue
  const username = `nova_${Date.now().toString(36)}`;

  // ------------------------------------------------------------------ CREATE
  title('CREATE: new player + session in MySQL -> embedded into MongoDB');
  const { insertId: uid } = await q(
    `INSERT INTO users (username, display_name, bio, timezone, country_code, home_region_id)
     VALUES (?, 'Nova', 'Chill late-night Minecraft builder: redstone farms, cozy survival bases and castle builds with friends',
             'Europe/London', 'GB', 11)`, [username]);
  await q('INSERT INTO user_role (user_id, role_id) VALUES (?, 1)', [uid]);
  await q(`INSERT INTO user_language (user_id, language_code, proficiency, is_preferred) VALUES (?, 'en', 'native', TRUE)`, [uid]);
  await q('INSERT INTO user_tag (user_id, tag_id) VALUES (?, 1), (?, 7)', [uid, uid]);             // chill, late-night
  const { insertId: pid } = await q(
    'INSERT INTO player_game_profile (user_id, game_id, hours_played, is_main) VALUES (?, 1, 300, TRUE)', [uid]);
  await q('INSERT INTO profile_mode (profile_id, game_id, mode_id) VALUES (?, 1, 4)', [pid]);      // Survival Multiplayer
  await q('INSERT INTO profile_role (profile_id, game_id, game_role_id) VALUES (?, 1, 3)', [pid]); // Builder

  const { insertId: sid } = await q(
    `INSERT INTO lfg_session (host_id, game_id, mode_id, platform_id, region_id, title, description, max_players)
     VALUES (4, 1, 4, 1, 12, 'Cozy SMP build night', 'Building a medieval town together, redstone nerds welcome', 6)`);
  await q(`INSERT INTO session_participant (session_id, user_id, game_role_id, platform_account_id, status)
           VALUES (?, 4, 3, 7, 'accepted')`, [sid]);
  await q(`INSERT INTO session_language (session_id, language_code) VALUES (?, 'en')`, [sid]);
  await q('INSERT INTO session_tag (session_id, tag_id) VALUES (?, 1)', [sid]);
  await q('INSERT INTO session_slot (session_id, slot_no, game_id, game_role_id, slots_needed) VALUES (?, 1, 1, 3, 2)', [sid]);
  console.log(`MySQL: user ${uid} (${username}), session ${sid}`);
  await outbox();
  await drain();
  await Promise.all([waitSearchable('players', uid), waitSearchable('sessions', sid)]);   // index catches up async
  note(`player_embeddings.findOne({_id: ${uid}})`);
  console.log(short(await players.findOne({ _id: uid })));
  note(`collection sizes: players=${await players.countDocuments()}, sessions=${await sessions.countDocuments()}`);

  // ------------------------------------------------------------------ READ
  title('READ: similarity search ($vectorSearch with filters)');
  note(`players with interests like ${username} (Minecraft, active only)`);
  table(await similarPlayers(uid, { gameId: 1, k: 4 }), ['_id', 'username', 'score', 'source_text']);
  note('players like kiara_ctrl (12), Valorant only');
  table(await similarPlayers(12, { gameId: 2, k: 3 }), ['_id', 'username', 'score', 'source_text']);
  note(`open public sessions matching ${username}'s interests`);
  table(await similarSessions(uid, { k: 3 }), ['_id', 'score', 'source_text']);
  note('hybrid for aarav_plays (1): SQL hard filters + rule score, reranked by vector similarity, logged');
  table(await hybridSessions(1, { k: 5, log: true }), ['session_id', 'title', 'rule', 'vector', 'score']);
  table((await q(`SELECT rec_id, session_id, score, source, score_breakdown FROM match_recommendation
                   WHERE source = 'hybrid' ORDER BY rec_id DESC LIMIT 3`))
    .map((r) => ({ ...r, score_breakdown: JSON.stringify(r.score_breakdown) })),
  ['rec_id', 'session_id', 'score', 'source', 'score_breakdown']);

  // ------------------------------------------------------------------ UPDATE
  title('UPDATE: profile edits re-embed; unchanged text only refreshes fields');
  const before = await players.findOne({ _id: uid }, { projection: { source_hash: 1, embedded_at: 1 } });
  await q(`UPDATE users SET bio = 'Competitive Bedwars tryhard: fast rushes, clutch bed defence, ranked grind' WHERE user_id = ?`, [uid]);
  await q('DELETE FROM user_tag WHERE user_id = ?', [uid]);
  await q('INSERT INTO user_tag (user_id, tag_id) VALUES (?, 2), (?, 5)', [uid, uid]);             // competitive, tryhard
  await q('INSERT INTO profile_mode (profile_id, game_id, mode_id) VALUES (?, 1, 1)', [pid]);      // Bedwars
  await q('INSERT INTO profile_role (profile_id, game_id, game_role_id) VALUES (?, 1, 2)', [pid]); // Rusher
  note('several edits, one coalesced outbox row:');
  await outbox();
  await drain();
  const after = await players.findOne({ _id: uid }, { projection: { source_hash: 1, embedded_at: 1, source_text: 1 } });
  console.table([{ version: 'before', ...before }, { version: 'after', ...after }]
    .map(({ source_text, ...r }) => ({ ...r, source_hash: `${r.source_hash.slice(0, 12)}…` })));
  console.log(`new source_text: ${after.source_text}`);
  note(`players like ${username} now`);
  table(await similarPlayers(uid, { gameId: 1, k: 4 }), ['_id', 'username', 'score', 'source_text']);

  await q(`UPDATE users SET display_name = 'Nova (EU)' WHERE user_id = ?`, [uid]);
  note('display_name is not embedded: same hash, filter fields refreshed, no re-embed');
  await drain();

  // ------------------------------------------------------------------ DELETE
  title('DELETE: cancelled session and banned player leave the vector store');
  await q(`UPDATE lfg_session SET status = 'cancelled' WHERE session_id = ?`, [sid]);
  await q(`INSERT INTO sanction (user_id, sanction_type, reason, issued_by) VALUES (?, 'ban', 'demo: account removal', 10)`, [uid]);
  await outbox();
  await drain();
  await Promise.all([waitSearchable('players', uid, { present: false }), waitSearchable('sessions', sid, { present: false })]);
  note(`players like tom_builds (6) after the ban: ${username} is gone`);
  table(await similarPlayers(6, { gameId: 1, k: 4 }), ['_id', 'username', 'score']);
  console.log(`players.findOne({_id: ${uid}}) -> ${JSON.stringify(await players.findOne({ _id: uid }))}`);
  console.log(`sessions.findOne({_id: ${sid}}) -> ${JSON.stringify(await sessions.findOne({ _id: sid }))}`);
  note(`collection sizes: players=${await players.countDocuments()}, sessions=${await sessions.countDocuments()}`);
}

main().catch((err) => { console.error(err); process.exitCode = 1; }).finally(closeAll);
