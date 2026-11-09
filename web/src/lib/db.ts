import "server-only";
import mysql, { type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { LOGIN_SUFFIX, POOL_LIMIT, type DbLogin } from "./db-roles";

// Read-only data layer for the web app. Credentials come from env vars only
// (see .env.example); the password is never stored in a file.

declare global {
  // globalThis augmentation needs `var`
  var __pairadiceMysqlPools: Partial<Record<DbLogin, Pool>> | undefined;
  var __pairadiceRootWarned: boolean | undefined;
}

/** Values the app may bind. Numbers must be safe integers (ids, limits). */
export type SqlParam = string | number | boolean | null | readonly number[] | Buffer;
export type SqlParams = ReadonlyArray<SqlParam>;

export type { DbLogin } from "./db-roles";

const READ_ONLY_USER = "pairadice_web_ro";
const QUERY_TIMEOUT_MS = 15_000;

function readPort(): number {
  const raw = process.env.MYSQL_PORT;
  if (raw === undefined || raw === "") return 3306;
  const port = /^\d{1,5}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`MYSQL_PORT must be an integer between 1 and 65535 (got "${raw}").`);
  }
  return port;
}

/** The root / MYSQL_USER / MYSQL_PWD fallback exists for local development only, and only when asked for. */
function devFallbackEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.PAIRADICE_DEV_DB_FALLBACK === "1";
}

function readUser(login: DbLogin): string {
  const suffix = LOGIN_SUFFIX[login];
  let user = process.env[`PD_DB_USER_${suffix}`];
  if ((user === undefined || user === "") && login === "web" && devFallbackEnabled()) {
    user = process.env.MYSQL_USER || "root";
  }
  if (user === undefined || user === "") {
    throw new Error(
      `PD_DB_USER_${suffix} is not set. Start the app with "bun run dev:kc" (reads the logins from the macOS Keychain), ` +
        `or export PD_DB_USER_${suffix} and PD_DB_PWD_${suffix}. ` +
        `Local development may set PAIRADICE_DEV_DB_FALLBACK=1 to use MYSQL_USER/MYSQL_PWD instead.`,
    );
  }
  if (process.env.NODE_ENV === "production" && user.toLowerCase() === "root") {
    throw new Error(
      `Refusing to connect as root in production. Set PD_DB_USER_${suffix} to a non-root login (web: ${READ_ONLY_USER}, created by database/setup.sh).`,
    );
  }
  if (user.toLowerCase() === "root" && !globalThis.__pairadiceRootWarned) {
    globalThis.__pairadiceRootWarned = true;
    console.warn(
      `[pairadice] Connecting to MySQL as root (dev fallback). Prefer a role login: bun run dev:kc.`,
    );
  }
  return user;
}

function createPool(login: DbLogin): Pool {
  // MYSQL_SOCKET selects a passwordless auth_socket login; otherwise TCP with a password.
  const socketPath = process.env.MYSQL_SOCKET;
  const suffix = LOGIN_SUFFIX[login];
  let password = process.env[`PD_DB_PWD_${suffix}`];
  if ((password === undefined || password === "") && login === "web" && devFallbackEnabled()) {
    password = process.env.MYSQL_PWD;
  }
  if (!socketPath && (password === undefined || password === "")) {
    throw new Error(
      `Neither MYSQL_SOCKET nor PD_DB_PWD_${suffix} is set. Start the app with "bun run dev:kc" or export one in the shell. Credentials are never stored in files.`,
    );
  }
  const pool = mysql.createPool({
    ...(socketPath
      ? { socketPath }
      : { host: process.env.MYSQL_HOST ?? "127.0.0.1", port: readPort(), password }),
    user: readUser(login),
    database: process.env.MYSQL_DATABASE ?? "pairadice",
    charset: "utf8mb4_0900_ai_ci",
    timezone: "Z",
    // keep DATETIME(6) as strings; DECIMALs as numbers (same as vector/src/db.js)
    dateStrings: true,
    decimalNumbers: true,
    stringifyObjects: true,
    connectionLimit: POOL_LIMIT[login],
    queueLimit: 200,
    connectTimeout: 10_000,
    enableKeepAlive: true,
  });
  // Every DATETIME in the schema is UTC; make the session agree so NOW() and
  // UTC_TIMESTAMP() match. Queued ahead of any query on that connection.
  pool.pool.on("connection", (conn) => {
    conn.query("SET time_zone = '+00:00'", (err) => {
      if (err) console.error("[pairadice] could not set session time_zone:", err.message);
    });
  });
  return pool;
}

/** One lazily created pool per login; cached on globalThis so dev HMR does not leak connections. */
export function poolFor(login: DbLogin): Pool {
  const pools = (globalThis.__pairadiceMysqlPools ??= {});
  return (pools[login] ??= createPool(login));
}

/** The "web" (read-only) pool. */
export function getPool(): Pool {
  return poolFor("web");
}

function checkParams(params: SqlParams): void {
  for (const p of params) {
    if (typeof p === "number") {
      if (!Number.isSafeInteger(p)) throw new Error(`SQL parameter is not a safe integer: ${p}`);
    } else if (Buffer.isBuffer(p)) {
      continue;
    } else if (Array.isArray(p)) {
      if (p.length === 0) throw new Error("SQL list parameter must not be empty");
      for (const n of p) {
        if (!Number.isSafeInteger(n)) throw new Error(`SQL list parameter is not a safe integer: ${n}`);
      }
    }
  }
}

/** Run a parameterised SELECT and return its rows. */
export async function query<T extends object>(sql: string, params: SqlParams = []): Promise<T[]> {
  checkParams(params);
  const [rows] = await poolFor("web").query<Array<T & RowDataPacket>>({
    sql,
    values: [...params],
    timeout: QUERY_TIMEOUT_MS,
  });
  if (!Array.isArray(rows)) throw new Error("Unexpected MySQL result: expected a row array.");
  return rows;
}

/**
 * Run a `CALL proc(...)` through the given login and return its first result set.
 * mysql2 returns [resultSet1, ..., OkPacket] for CALL; anything else is an error.
 */
export async function callProcAs<T extends object>(
  login: DbLogin,
  sql: string,
  params: SqlParams = [],
): Promise<T[]> {
  checkParams(params);
  const [result] = await poolFor(login).query<Array<Array<T & RowDataPacket>>>({
    sql,
    values: [...params],
    timeout: QUERY_TIMEOUT_MS,
  });
  const shape: unknown = result;
  if (!Array.isArray(shape) || !Array.isArray(shape[0])) {
    throw new Error("Unexpected result shape from CALL: expected a result set.");
  }
  return result[0];
}

/** Run a parameterised SELECT through the given login's pool. */
export async function queryAs<T extends object>(
  login: DbLogin,
  sql: string,
  params: SqlParams = [],
): Promise<T[]> {
  checkParams(params);
  const [rows] = await poolFor(login).query<Array<T & RowDataPacket>>({
    sql,
    values: [...params],
    timeout: QUERY_TIMEOUT_MS,
  });
  if (!Array.isArray(rows)) throw new Error("Unexpected MySQL result: expected a row array.");
  return rows;
}

/** Run a parameterised INSERT/UPDATE/DELETE through the given login's pool. */
export async function execAs(login: DbLogin, sql: string, params: SqlParams = []): Promise<ResultSetHeader> {
  checkParams(params);
  const [result] = await poolFor(login).query<ResultSetHeader>({
    sql,
    values: [...params],
    timeout: QUERY_TIMEOUT_MS,
  });
  if (Array.isArray(result)) throw new Error("Unexpected MySQL result: expected a result header.");
  return result;
}

/**
 * Run fn on one connection inside BEGIN/COMMIT; ROLLBACK on error. If BEGIN, ROLLBACK or COMMIT itself
 * fails the connection state is unknown, so it is destroyed instead of going back to the pool.
 */
export async function transactionAs<R>(
  login: DbLogin,
  fn: (conn: PoolConnection) => Promise<R>,
): Promise<R> {
  const conn = await poolFor(login).getConnection();
  let discard = false;
  try {
    try {
      await conn.beginTransaction();
    } catch (err) {
      discard = true;
      throw err;
    }
    let result: R;
    try {
      result = await fn(conn);
    } catch (err) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        discard = true;
        console.error("[pairadice] rollback failed:", rollbackErr instanceof Error ? rollbackErr.message : "unknown");
      }
      throw err;
    }
    try {
      await conn.commit();
    } catch (err) {
      discard = true;
      throw err;
    }
    return result;
  } finally {
    if (discard) conn.destroy();
    else conn.release();
  }
}
