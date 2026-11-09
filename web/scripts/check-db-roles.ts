// Proves each app login really has the privileges (and only the privileges) it should.
// Run: bun run check:db   (reads the logins from the Keychain via scripts/dev-keychain.sh)
// Standalone: plain mysql2, no "server-only". Prints login names and error numbers, never passwords.
// Every probe runs inside a transaction that is rolled back, or matches no rows (WHERE 1 = 0).
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";

interface Check {
  login: string;
  userVar: string;
  pwdVar: string;
  label: string;
  sql: string;
  /** MySQL error numbers that count as "denied"; empty means the statement must succeed */
  deniedErrnos: number[];
}

// 1142 table privilege, 1143 column privilege, 1044 schema-level denial (CREATE), 1370 routine privilege
const checks: Check[] = [
  {
    login: "web",
    userVar: "PD_DB_USER_WEB",
    pwdVar: "PD_DB_PWD_WEB",
    label: "SELECT FROM message",
    sql: "SELECT 1 FROM message WHERE 1 = 0",
    deniedErrnos: [1142],
  },
  {
    login: "auth",
    userVar: "PD_DB_USER_AUTH",
    pwdVar: "PD_DB_PWD_AUTH",
    label: "SELECT FROM sanction",
    sql: "SELECT 1 FROM sanction WHERE 1 = 0",
    deniedErrnos: [1142],
  },
  {
    login: "player",
    userVar: "PD_DB_USER_PLAYER",
    pwdVar: "PD_DB_PWD_PLAYER",
    label: "UPDATE users SET trust_score",
    sql: "UPDATE users SET trust_score = trust_score WHERE 1 = 0",
    deniedErrnos: [1142, 1143],
  },
  {
    login: "moderator",
    userVar: "PD_DB_USER_MODERATOR",
    pwdVar: "PD_DB_PWD_MODERATOR",
    label: "DELETE FROM users",
    sql: "DELETE FROM users WHERE 1 = 0",
    deniedErrnos: [1142],
  },
  // Phase 6: the direct moderation grants were replaced by procedures (12_moderation.sql)
  {
    login: "player",
    userVar: "PD_DB_USER_PLAYER",
    pwdVar: "PD_DB_PWD_PLAYER",
    label: "INSERT INTO report",
    sql: "INSERT INTO report (reporter_id, reported_user_id, category) SELECT 1, 2, 'spam' FROM DUAL WHERE 1 = 0",
    deniedErrnos: [1142],
  },
  {
    login: "player",
    userVar: "PD_DB_USER_PLAYER",
    pwdVar: "PD_DB_PWD_PLAYER",
    label: "CALL sp_issue_sanction",
    sql: "CALL sp_issue_sanction(0, 0, 'warn', 'probe', NULL, NULL, @pd_probe)",
    deniedErrnos: [1370],
  },
  {
    login: "moderator",
    userVar: "PD_DB_USER_MODERATOR",
    pwdVar: "PD_DB_PWD_MODERATOR",
    label: "INSERT INTO sanction",
    sql: "INSERT INTO sanction (user_id, sanction_type, reason, issued_by) SELECT 1, 'warn', 'probe', 2 FROM DUAL WHERE 1 = 0",
    deniedErrnos: [1142],
  },
  {
    login: "moderator",
    userVar: "PD_DB_USER_MODERATOR",
    pwdVar: "PD_DB_PWD_MODERATOR",
    label: "UPDATE report",
    sql: "UPDATE report SET status = status WHERE 1 = 0",
    deniedErrnos: [1142, 1143],
  },
  {
    login: "moderator",
    userVar: "PD_DB_USER_MODERATOR",
    pwdVar: "PD_DB_PWD_MODERATOR",
    label: "UPDATE message SET is_deleted",
    sql: "UPDATE message SET is_deleted = is_deleted WHERE 1 = 0",
    deniedErrnos: [1142, 1143],
  },
  {
    login: "moderator",
    userVar: "PD_DB_USER_MODERATOR",
    pwdVar: "PD_DB_PWD_MODERATOR",
    label: "CALL sp_grant_role",
    sql: "CALL sp_grant_role(0, 0, 'player')",
    deniedErrnos: [1370],
  },
  // Phase 5: chat goes through procedures (13_chat.sql); the player has no direct SELECT or INSERT on message
  {
    login: "player",
    userVar: "PD_DB_USER_PLAYER",
    pwdVar: "PD_DB_PWD_PLAYER",
    label: "SELECT FROM message",
    sql: "SELECT 1 FROM message WHERE 1 = 0",
    deniedErrnos: [1142],
  },
  {
    login: "player",
    userVar: "PD_DB_USER_PLAYER",
    pwdVar: "PD_DB_PWD_PLAYER",
    label: "INSERT INTO message",
    sql: "INSERT INTO message (sender_id, receiver_id, content) SELECT 1, 2, 'probe' FROM DUAL WHERE 1 = 0",
    deniedErrnos: [1142],
  },
  {
    login: "player",
    userVar: "PD_DB_USER_PLAYER",
    pwdVar: "PD_DB_PWD_PLAYER",
    label: "INSERT INTO review",
    sql: "INSERT INTO review (session_id, reviewer_id, reviewed_id, rating) SELECT 1, 1, 2, 5 FROM DUAL WHERE 1 = 0",
    deniedErrnos: [1142],
  },
  {
    login: "player",
    userVar: "PD_DB_USER_PLAYER",
    pwdVar: "PD_DB_PWD_PLAYER",
    label: "CALL sp_discord_login",
    sql: "CALL sp_discord_login('0', NULL, NULL, NULL, @pd_probe)",
    deniedErrnos: [1370],
  },
  {
    login: "admin",
    userVar: "PD_DB_USER_ADMIN",
    pwdVar: "PD_DB_PWD_ADMIN",
    label: "CREATE TABLE",
    sql: "CREATE TABLE pd_check_db_roles_probe (id INT)",
    deniedErrnos: [1142, 1044],
  },
];

/** A second probe per login that must SUCCEED (the login is not simply broken). */
const allowed: Record<string, { label: string; sql: string; okErrnos?: number[] }[]> = {
  admin: [{ label: "SELECT FROM audit_log", sql: "SELECT COUNT(*) AS n FROM audit_log" }],
  // moderation screens read message evidence directly (explicit grant, no longer inherited from player)
  moderator: [{ label: "SELECT COUNT(*) FROM message", sql: "SELECT COUNT(*) AS n FROM message" }],
};

/**
 * Procedures a login MUST be able to run. Actor 0 matches no user, so the procedure itself refuses with
 * SQLSTATE 45000 (errno 1644); that proves EXECUTE is granted and nothing is written.
 */
const mayExecute: Record<string, { label: string; sql: string; okErrnos: number[] }[]> = {
  player: [
    { label: "CALL sp_report_user (runs, refused by the rules)", sql: "CALL sp_report_user(0, 0, 'spam', NULL, NULL, NULL, @pd_probe)", okErrnos: [1644] },
    { label: "CALL sp_chat_history (runs, refused by the rules)", sql: "CALL sp_chat_history(0, 0, NULL, 1)", okErrnos: [1644] },
  ],
  auth: [
    // an invalid snowflake is refused before anything is written
    { label: "CALL sp_discord_login (runs, refused by the rules)", sql: "CALL sp_discord_login('0', NULL, NULL, NULL, @pd_probe)", okErrnos: [1644] },
  ],
  moderator: [{ label: "CALL sp_claim_report (runs, refused by the rules)", sql: "CALL sp_claim_report(0, 0)", okErrnos: [1644] }],
};

function errnoOf(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "errno" in err) {
    const n = (err as { errno: unknown }).errno;
    return typeof n === "number" ? n : undefined;
  }
  return undefined;
}

async function rollback(conn: Connection): Promise<void> {
  await conn.query("ROLLBACK").catch(() => undefined);
}

/** True when the statement is denied with one of the expected errnos. */
async function expectDenied(conn: Connection, c: Check): Promise<boolean> {
  await conn.query("START TRANSACTION");
  try {
    await conn.query(c.sql);
    console.log(`  FAIL: ${c.label} unexpectedly succeeded`);
    return false;
  } catch (err) {
    const errno = errnoOf(err);
    if (errno !== undefined && c.deniedErrnos.includes(errno)) {
      console.log(`  OK: ${c.label} denied (errno ${errno})`);
      return true;
    }
    console.log(`  FAIL: ${c.label} failed with errno ${String(errno)}, expected one of ${c.deniedErrnos.join("/")}`);
    return false;
  } finally {
    await rollback(conn);
  }
}

async function expectAllowed(conn: Connection, probe: { label: string; sql: string; okErrnos?: number[] }): Promise<boolean> {
  await conn.query("START TRANSACTION");
  try {
    await conn.query(probe.sql);
    console.log(`  OK: ${probe.label} allowed`);
    return true;
  } catch (err) {
    const errno = errnoOf(err);
    if (errno !== undefined && probe.okErrnos?.includes(errno)) {
      console.log(`  OK: ${probe.label} allowed (errno ${errno})`);
      return true;
    }
    console.log(`  FAIL: ${probe.label} should be allowed but failed with errno ${String(errnoOf(err))}`);
    return false;
  } finally {
    await rollback(conn);
  }
}

async function runLogin(c: Check): Promise<boolean> {
  const user = process.env[c.userVar];
  const password = process.env[c.pwdVar];
  if (!user || !password) {
    console.log(`${c.login} -> FAIL: ${c.userVar} / ${c.pwdVar} not set (run through scripts/dev-keychain.sh)`);
    return false;
  }
  let conn: Connection | undefined;
  try {
    conn = await mysql.createConnection({
      host: process.env.MYSQL_HOST ?? "127.0.0.1",
      port: Number(process.env.MYSQL_PORT ?? 3306),
      user,
      password,
      database: process.env.MYSQL_DATABASE ?? "pairadice",
    });
    const [rows] = await conn.query<RowDataPacket[]>("SELECT CURRENT_USER() AS u, CURRENT_ROLE() AS r");
    console.log(`${c.login} -> CURRENT_USER=${String(rows[0]?.u)} CURRENT_ROLE=${String(rows[0]?.r)}`);
    let ok = await expectDenied(conn, c);
    for (const probe of allowed[c.login] ?? []) ok = (await expectAllowed(conn, probe)) && ok;
    for (const probe of mayExecute[c.login] ?? []) ok = (await expectAllowed(conn, probe)) && ok;
    return ok;
  } catch (err) {
    console.log(`${c.login} -> FAIL: could not connect or query (errno ${String(errnoOf(err))})`);
    return false;
  } finally {
    await conn?.end().catch(() => undefined);
  }
}

let allOk = true;
for (const c of checks) {
  if (!(await runLogin(c))) allOk = false;
}
console.log(allOk ? "ALL OK" : "FAILED");
process.exit(allOk ? 0 : 1);
