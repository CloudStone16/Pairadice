// Proves each DB login maps to the right MySQL role. Run: bun run check:db
// Standalone (no "server-only" imports). Prints no secrets.
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";

type Role = "web" | "auth" | "player" | "moderator" | "admin";

interface Check {
  role: Role;
  userVar: string;
  pwdVar: string;
  defaultUser: string;
  label: string;
  sql: string;
  /** error numbers that count as "denied"; empty = must succeed */
  deniedErrnos: number[];
}

const checks: Check[] = [
  {
    role: "web", userVar: "PD_WEB_USER", pwdVar: "PD_WEB_PWD", defaultUser: "pd_web",
    label: "INSERT INTO message",
    sql: "INSERT INTO message (session_id, sender_id, body) SELECT 1, 1, 'x' FROM DUAL WHERE 1 = 0",
    deniedErrnos: [1142, 1143],
  },
  {
    role: "auth", userVar: "PD_AUTH_USER", pwdVar: "PD_AUTH_PWD", defaultUser: "pd_auth",
    label: "SELECT FROM sanction",
    sql: "SELECT * FROM sanction WHERE 1 = 0",
    deniedErrnos: [1142, 1143],
  },
  {
    role: "player", userVar: "PD_API_USER", pwdVar: "PD_API_PWD", defaultUser: "pd_api",
    label: "UPDATE users SET trust_score",
    sql: "UPDATE users SET trust_score = trust_score WHERE user_id = 1 AND 1 = 0",
    deniedErrnos: [1142, 1143],
  },
  {
    role: "moderator", userVar: "PD_MOD_USER", pwdVar: "PD_MOD_PWD", defaultUser: "pd_mod",
    label: "DELETE FROM users",
    sql: "DELETE FROM users WHERE user_id = 0",
    deniedErrnos: [1142, 1143],
  },
  {
    role: "admin", userVar: "PD_ADMIN_USER", pwdVar: "PD_ADMIN_PWD", defaultUser: "pd_admin",
    label: "SELECT COUNT(*) FROM audit_log",
    sql: "SELECT COUNT(*) AS n FROM audit_log",
    deniedErrnos: [],
  },
];

function errnoOf(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "errno" in err) {
    const n = (err as { errno: unknown }).errno;
    return typeof n === "number" ? n : undefined;
  }
  return undefined;
}

async function runCheck(c: Check): Promise<boolean> {
  const password = process.env[c.pwdVar];
  if (!password) {
    console.log(`${c.role} -> FAIL: ${c.pwdVar} not set`);
    return false;
  }
  let conn: Connection | undefined;
  try {
    conn = await mysql.createConnection({
      host: process.env.MYSQL_HOST ?? "127.0.0.1",
      port: Number(process.env.MYSQL_PORT ?? 3306),
      user: process.env[c.userVar] || c.defaultUser,
      password,
      database: process.env.MYSQL_DATABASE ?? "pairadice",
    });
    // Roles are not active by default unless set as default roles; report as the server sees it.
    const [rows] = await conn.query<RowDataPacket[]>("SELECT CURRENT_USER() AS u, CURRENT_ROLE() AS r");
    console.log(`${c.role} -> ${String(rows[0]?.u)}, ${String(rows[0]?.r)}`);

    await conn.query("START TRANSACTION");
    try {
      await conn.query(c.sql);
      await conn.query("ROLLBACK");
      if (c.deniedErrnos.length === 0) {
        console.log(`  OK: ${c.label} allowed`);
        return true;
      }
      console.log(`  FAIL: ${c.label} unexpectedly succeeded`);
      return false;
    } catch (err) {
      await conn.query("ROLLBACK").catch(() => undefined);
      const errno = errnoOf(err);
      if (errno !== undefined && c.deniedErrnos.includes(errno)) {
        console.log(`  OK: ${c.label} denied (errno ${errno})`);
        return true;
      }
      console.log(`  FAIL: ${c.label} failed with errno ${String(errno)}`);
      return false;
    }
  } catch (err) {
    console.log(`${c.role} -> FAIL: connection/query error (errno ${String(errnoOf(err))})`);
    return false;
  } finally {
    await conn?.end().catch(() => undefined);
  }
}

let ok = true;
for (const c of checks) {
  if (!(await runCheck(c))) ok = false;
}
console.log(ok ? "ALL OK" : "FAILED");
process.exit(ok ? 0 : 1);
