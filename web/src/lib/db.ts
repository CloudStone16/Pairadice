import "server-only";
import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";

// Read-only data layer for the web app. Credentials come from env vars only
// (see .env.example); the password is never stored in a file.

declare global {
  // globalThis augmentation needs `var`
  var __pairadiceMysqlPool: Pool | undefined;
  var __pairadiceRootWarned: boolean | undefined;
}

/** Values the app may bind. Numbers must be safe integers (ids, limits). */
export type SqlParam = string | number | boolean | null | readonly number[];
export type SqlParams = ReadonlyArray<SqlParam>;

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

function readUser(): string {
  const isProd = process.env.NODE_ENV === "production";
  const user = process.env.MYSQL_USER;
  if (isProd && (user === undefined || user === "" || user.toLowerCase() === "root")) {
    throw new Error(
      `Refusing to connect as root in production. Set MYSQL_USER=${READ_ONLY_USER} (created by database/setup.sh --web-user).`,
    );
  }
  const resolved = user === undefined || user === "" ? "root" : user;
  if (resolved.toLowerCase() === "root" && !globalThis.__pairadiceRootWarned) {
    globalThis.__pairadiceRootWarned = true;
    console.warn(
      `[pairadice] Connecting to MySQL as root. Prefer the read-only login: MYSQL_USER=${READ_ONLY_USER} (database/setup.sh --web-user).`,
    );
  }
  return resolved;
}

function createPool(): Pool {
  const password = process.env.MYSQL_PWD;
  if (password === undefined || password === "") {
    throw new Error(
      "MYSQL_PWD is not set. Export it in the shell before starting the app, e.g. `MYSQL_PWD=... bun run dev`. Credentials are never stored in files.",
    );
  }
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST ?? "127.0.0.1",
    port: readPort(),
    user: readUser(),
    password,
    database: process.env.MYSQL_DATABASE ?? "pairadice",
    charset: "utf8mb4_0900_ai_ci",
    timezone: "Z",
    // keep DATETIME(6) as strings; DECIMALs as numbers (same as vector/src/db.js)
    dateStrings: true,
    decimalNumbers: true,
    stringifyObjects: true,
    connectionLimit: 10,
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

/** Lazily created pool; cached on globalThis so dev HMR does not leak connections. */
export function getPool(): Pool {
  if (!globalThis.__pairadiceMysqlPool) {
    globalThis.__pairadiceMysqlPool = createPool();
  }
  return globalThis.__pairadiceMysqlPool;
}

function checkParams(params: SqlParams): void {
  for (const p of params) {
    if (typeof p === "number") {
      if (!Number.isSafeInteger(p)) throw new Error(`SQL parameter is not a safe integer: ${p}`);
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
  const [rows] = await getPool().query<Array<T & RowDataPacket>>({
    sql,
    values: [...params],
    timeout: QUERY_TIMEOUT_MS,
  });
  if (!Array.isArray(rows)) throw new Error("Unexpected MySQL result: expected a row array.");
  return rows;
}

/**
 * Run a `CALL proc(...)` and return its first result set.
 * mysql2 returns [resultSet1, ..., OkPacket] for CALL; anything else is an error.
 */
export async function callProc<T extends object>(sql: string, params: SqlParams = []): Promise<T[]> {
  checkParams(params);
  const [result] = await getPool().query<Array<Array<T & RowDataPacket>>>({
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
