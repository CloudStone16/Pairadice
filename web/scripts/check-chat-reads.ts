// Proves the READ procedures of database/13_chat.sql (sp_chat_history, sp_dm_thread, sp_dm_inbox, sp_dm_can_message,
// sp_my_chat_status, sp_pending_reviews). MySQL cannot capture a CALL result set in SQL, so this runs from Node.
// Run: MYSQL_PWD=... bun run check:chat      (MYSQL_USER defaults to root, MYSQL_HOST to 127.0.0.1; the password only
// comes from the environment.) Setup and teardown are its own: it builds one camp, relationships, messages and a mute,
// then removes them by id and restores the vector outbox. Prints N/N passed, exits 1 on any failure.
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";

type Row = RowDataPacket;
let passed = 0;
let total = 0;

function check(label: string, ok: boolean, detail?: unknown): void {
  total += 1;
  if (ok) passed += 1;
  else console.log(`FAIL: ${label}${detail === undefined ? "" : ` -> ${JSON.stringify(detail)}`}`);
}
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

async function main(): Promise<void> {
  const conn: Connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST ?? "127.0.0.1",
    port: Number(process.env.MYSQL_PORT ?? 3306),
    user: process.env.MYSQL_USER ?? "root",
    password: process.env.MYSQL_PWD,
    database: "pairadice",
    timezone: "Z",
  });

  const q = async (sql: string, args: unknown[] = []): Promise<Row[]> => {
    const [rows] = await conn.query<Row[]>(sql, args);
    return rows;
  };
  /** CALL that returns one result set */
  const call = async (sql: string, args: unknown[] = []): Promise<Row[]> => {
    const [res] = await conn.query<RowDataPacket[][]>(sql, args);
    return res[0] as Row[];
  };
  const refusal = async (sql: string, args: unknown[] = []): Promise<string> => {
    try {
      await conn.query(sql, args);
      return "(no error)";
    } catch (e) {
      return (e as { sqlMessage?: string }).sqlMessage ?? String(e);
    }
  };
  const send = async (sql: string, args: unknown[]): Promise<number> => {
    await conn.query(sql, args);
    return Number((await q("SELECT @pd_id AS id"))[0].id);
  };
  const say = (actor: number, sid: number, text: string) => send("CALL sp_send_session_message(?, ?, ?, @pd_id)", [actor, sid, text]);
  const dm = (actor: number, to: number, text: string) => send("CALL sp_send_dm(?, ?, ?, @pd_id)", [actor, to, text]);
  const ids = (rows: Row[]): number[] => rows.map((r) => Number(r.message_id));

  // ---- baseline for teardown
  const max = async (sql: string): Promise<number> => Number((await q(sql))[0].m);
  const m0 = await max("SELECT IFNULL(MAX(message_id), 0) AS m FROM message");
  const a0 = await max("SELECT IFNULL(MAX(log_id), 0) AS m FROM audit_log");
  const s0 = await max("SELECT IFNULL(MAX(sanction_id), 0) AS m FROM sanction");
  const outbox = await q("SELECT * FROM embedding_outbox");
  const key = (r: Row): string => `${String(r.entity)}:${String(r.entity_id)}`;
  let sid = 0;

  try {
    // ---- setup: one camp. host 1; 8 and 12 accepted; 2 left; 5 kicked; 6 never joined
    await q(
      `INSERT INTO lfg_session (host_id, game_id, mode_id, platform_id, title, max_players, status)
       SELECT host_id, game_id, mode_id, platform_id, 'check-chat camp', max_players, 'open' FROM lfg_session WHERE session_id = 1`,
    );
    sid = Number((await q("SELECT LAST_INSERT_ID() AS id"))[0].id);
    for (const [u, st] of [[1, "accepted"], [8, "accepted"], [12, "accepted"], [2, "left"], [5, "kicked"]] as const) {
      await q("INSERT INTO session_participant (session_id, user_id, status) VALUES (?, ?, 'accepted')", [sid, u]);
      if (st !== "accepted")
        await q("UPDATE session_participant SET status = ?, left_at = UTC_TIMESTAMP() WHERE session_id = ? AND user_id = ?", [st, sid, u]);
    }

    // ---- sp_chat_history: who may read
    for (const [u, why] of [[2, "a user who left"], [5, "a kicked user"], [6, "a stranger"]] as const) {
      const msg = await refusal("CALL sp_chat_history(?, ?, NULL, 10)", [u, sid]);
      check(`sp_chat_history refuses ${why}`, msg === "You are not in this camp.", msg);
    }

    // ---- latest-N oldest first, after paging
    const i1 = await say(1, sid, "m1");
    const i2 = await say(8, sid, "m2");
    const i3 = await say(12, sid, "m3");
    const i4 = await say(1, sid, "m4");
    const i5 = await say(8, sid, "m5");
    check("host reads the whole history oldest first", same(ids(await call("CALL sp_chat_history(1, ?, NULL, 50)", [sid])), [i1, i2, i3, i4, i5]));
    check("latest 3 lines come back oldest first", same(ids(await call("CALL sp_chat_history(1, ?, NULL, 3)", [sid])), [i3, i4, i5]));
    check("p_after_id 0 behaves like NULL", same(ids(await call("CALL sp_chat_history(1, ?, 0, 3)", [sid])), [i3, i4, i5]));
    check("after paging returns only newer lines", same(ids(await call("CALL sp_chat_history(1, ?, ?, 50)", [sid, i2])), [i3, i4, i5]));
    check("after paging honours the limit and stays oldest first", same(ids(await call("CALL sp_chat_history(1, ?, ?, 2)", [sid, i2])), [i3, i4]));
    const first = (await call("CALL sp_chat_history(1, ?, NULL, 1)", [sid]))[0];
    check("history row has the contract columns", same(Object.keys(first), ["message_id", "sender_id", "username", "display_name", "content", "is_deleted", "sent_at", "edited_at"]), Object.keys(first));

    // ---- blocked senders are hidden, in both directions
    await q("INSERT INTO user_block (blocker_id, blocked_id) VALUES (8, 12)");
    check("a blocked sender's lines are hidden from the blocker", same(ids(await call("CALL sp_chat_history(8, ?, NULL, 50)", [sid])), [i1, i2, i4, i5]));
    check("the blocked user does not see the blocker's lines", same(ids(await call("CALL sp_chat_history(12, ?, NULL, 50)", [sid])), [i1, i3, i4]));
    check("an unrelated member still sees every line", ids(await call("CALL sp_chat_history(1, ?, NULL, 50)", [sid])).length === 5);
    await q("DELETE FROM user_block WHERE blocker_id = 8 AND blocked_id = 12");

    // ---- deleted line
    await conn.query("CALL sp_delete_own_message(8, ?)", [i5]);
    const del = (await call("CALL sp_chat_history(1, ?, NULL, 50)", [sid])).find((r) => Number(r.message_id) === i5);
    check("a deleted line has content NULL and is_deleted 1", del !== undefined && del.content === null && Number(del.is_deleted) === 1, del);

    // ---- DM threads: 1<->8 friends, 12->8 teammates, 1->12 friends
    const dA = await dm(1, 8, "a");
    const dB = await dm(8, 1, "b");
    const dC = await dm(12, 8, "c");
    const dD = await dm(1, 12, "d");
    check("sp_dm_thread returns only that pair, oldest first", same(ids(await call("CALL sp_dm_thread(1, 8, ?, 50)", [m0])), [dA, dB]));
    check("sp_dm_thread is symmetric", same(ids(await call("CALL sp_dm_thread(8, 1, ?, 50)", [m0])), [dA, dB]));
    check("sp_dm_thread never returns a third party's DM", !ids(await call("CALL sp_dm_thread(1, 8, NULL, 50)", [])).some((x) => x === dC || x === dD));
    check("a third party asking for another pair gets nothing", (await call("CALL sp_dm_thread(5, 8, NULL, 50)", [])).length === 0 &&
      (await call("CALL sp_dm_thread(6, 1, NULL, 50)", [])).length === 0);
    check("the pair 8/12 sees only their own DM", same(ids(await call("CALL sp_dm_thread(8, 12, NULL, 50)", [])), [dC]));
    check("sp_dm_thread after paging", same(ids(await call("CALL sp_dm_thread(1, 8, ?, 50)", [dA])), [dB]));
    check("sp_dm_thread latest 1 line", same(ids(await call("CALL sp_dm_thread(1, 8, NULL, 1)", [])), [dB]));
    const dmCols = (await call("CALL sp_dm_thread(1, 8, NULL, 1)", []))[0];
    check("DM row has the contract columns", same(Object.keys(dmCols), ["message_id", "sender_id", "receiver_id", "content", "is_deleted", "sent_at"]), Object.keys(dmCols));

    // ---- inbox: one row per partner, newest first
    const inbox1 = await call("CALL sp_dm_inbox(1)", []);
    check("inbox has one row per partner, newest first", same(inbox1.map((r) => [Number(r.other_id), Number(r.message_id)]), [[12, dD], [8, dB]]), inbox1.map((r) => [r.other_id, r.message_id]));
    const inbox8 = await call("CALL sp_dm_inbox(8)", []);
    check("inbox for the other side shows the latest line per partner", same(inbox8.map((r) => [Number(r.other_id), Number(r.message_id)]), [[12, dC], [1, dB]]), inbox8.map((r) => [r.other_id, r.message_id]));
    check("inbox row has the contract columns", same(Object.keys(inbox1[0]), ["message_id", "other_id", "other_username", "other_display_name", "other_presence", "sender_id", "content", "is_deleted", "sent_at"]), Object.keys(inbox1[0]));
    check("inbox presence is online, away or offline", inbox1.every((r) => ["online", "away", "offline"].includes(String(r.other_presence))));

    // ---- blocked partner: thread empty, inbox omits, can_message refuses
    await q("INSERT INTO user_block (blocker_id, blocked_id) VALUES (8, 1)");
    check("sp_dm_thread is empty when blocked (blocked side)", (await call("CALL sp_dm_thread(1, 8, NULL, 50)", [])).length === 0);
    check("sp_dm_thread is empty when blocked (blocker side)", (await call("CALL sp_dm_thread(8, 1, NULL, 50)", [])).length === 0);
    check("a blocked partner is omitted from the inbox", same((await call("CALL sp_dm_inbox(1)", [])).map((r) => Number(r.other_id)), [12]));
    check("the blocker's inbox omits the blocked partner", same((await call("CALL sp_dm_inbox(8)", [])).map((r) => Number(r.other_id)), [12]));
    const blockedReason = (await call("CALL sp_dm_can_message(1, 8)", []))[0];
    check("sp_dm_can_message across a block", Number(blockedReason.can_message) === 0 && blockedReason.reason === "You cannot message this player.", blockedReason);
    await q("DELETE FROM user_block WHERE blocker_id = 8 AND blocked_id = 1");

    // ---- sp_dm_can_message reasons
    const can = async (a: number, b: number): Promise<[number, string | null]> => {
      const r = (await call("CALL sp_dm_can_message(?, ?)", [a, b]))[0];
      return [Number(r.can_message), r.reason as string | null];
    };
    check("can_message friends", same(await can(1, 8), [1, null]));
    check("can_message teammates who are not friends", same(await can(12, 8), [1, null]));
    check("can_message strangers", same(await can(1, 6), [0, "You can message friends and teammates only."]));
    check("can_message blocked (seed block 1/11)", same(await can(1, 11), [0, "You cannot message this player."]));
    check("can_message yourself", same(await can(1, 1), [0, "You cannot message yourself."]));
    check("can_message an unknown player", same(await can(1, 99999), [0, "That player does not exist."]));
    check("can_message with a NULL actor is refused", (await refusal("CALL sp_dm_can_message(NULL, 8)")) === "Your account cannot do that right now.");

    // ---- sp_my_chat_status
    const st0 = (await call("CALL sp_my_chat_status(12)", []))[0];
    check("no mute: account_status active and muted_until NULL", st0.account_status === "active" && st0.muted_until === null, st0);
    await q("INSERT INTO sanction (user_id, sanction_type, reason, issued_by, starts_at, ends_at) VALUES (12, 'mute', 'check-chat', 9, UTC_TIMESTAMP() - INTERVAL 1 MINUTE, UTC_TIMESTAMP() + INTERVAL 1 HOUR)");
    const st1 = (await call("CALL sp_my_chat_status(12)", []))[0];
    const until = st1.muted_until instanceof Date ? st1.muted_until.getTime() : NaN;
    check("a muted user gets muted_until about an hour ahead", Math.abs(until - (Date.now() + 3600_000)) < 120_000, st1);
    await q("DELETE FROM sanction WHERE sanction_id > ?", [s0]);
    check("a suspended user reports account_status suspended", (await call("CALL sp_my_chat_status(11)", []))[0].account_status === "suspended");

    // ---- sp_pending_reviews (seed: completed camp 4 with 1, 2, 7, 8; 1 has reviewed 7 and 8 only)
    const pend = async (a: number, s: number): Promise<number[]> => (await call("CALL sp_pending_reviews(?, ?)", [a, s])).map((r) => Number(r.user_id));
    check("pending reviews lists only the unreviewed teammate", same(await pend(1, 4), [2]), await pend(1, 4));
    check("pending reviews is empty when everyone is reviewed", same(await pend(7, 4), []));
    check("pending reviews is empty for a camp that is not completed", same(await pend(1, sid), []));
    check("pending reviews is empty for someone who did not play", same(await pend(5, 4), []));
    const pcols = (await call("CALL sp_pending_reviews(1, 4)", []))[0];
    check("pending row has the contract columns", same(Object.keys(pcols), ["user_id", "username", "display_name"]), Object.keys(pcols));
  } finally {
    // ---- teardown: only what this run created
    await conn.query("DELETE FROM message WHERE message_id > ?", [m0]);
    if (sid) await conn.query("DELETE FROM lfg_session WHERE session_id = ?", [sid]);
    await conn.query("DELETE FROM user_block WHERE (blocker_id, blocked_id) IN ((8, 12), (8, 1))");
    await conn.query("DELETE FROM sanction WHERE sanction_id > ?", [s0]);
    const saved = new Map(outbox.map((r) => [key(r), r]));
    for (const r of await q("SELECT * FROM embedding_outbox")) {
      const old = saved.get(key(r));
      if (!old) await conn.query("DELETE FROM embedding_outbox WHERE entity = ? AND entity_id = ?", [r.entity, r.entity_id]);
      else
        await conn.query("UPDATE embedding_outbox SET op = ?, enqueued_at = ?, attempts = ?, last_error = ? WHERE entity = ? AND entity_id = ?",
          [old.op, old.enqueued_at, old.attempts, old.last_error, r.entity, r.entity_id]);
    }
    await conn.query("DELETE FROM audit_log WHERE log_id > ?", [a0]);
    const left = await q("SELECT (SELECT COUNT(*) FROM message WHERE message_id > ?) + (SELECT COUNT(*) FROM lfg_session WHERE title = 'check-chat camp') AS n", [m0]);
    check("teardown left nothing behind", Number(left[0].n) === 0, left[0]);
    await conn.end();
  }
}

main()
  .then(() => {
    console.log(`${passed}/${total} passed`);
    process.exit(passed === total ? 0 : 1);
  })
  .catch((e: unknown) => {
    console.log(`ERROR: ${(e as { sqlMessage?: string }).sqlMessage ?? String(e)}`);
    console.log(`${passed}/${total} passed`);
    process.exit(1);
  });
