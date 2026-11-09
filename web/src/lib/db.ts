import "server-only";
import mysql, { type Pool, type PoolConnection, type RowDataPacket, type ResultSetHeader } from "mysql2/promise";
import { DB_ROLE_ENV, type DbRole } from "@/lib/db-roles";

// Data layer with one lazily created pool per DB role (RBAC lives in MySQL).
// Credentials come from env vars only (see .env.example, scripts/dev-keychain.sh).

declare global {
  // globalThis augmentation needs `var`
  var __pairadicePools: Map<DbRole, Pool> | undefined;
  var __pairadiceWarned: Set<string> | undefined;
}

/** Values the app may bind. Numbers must be safe integers (ids, limits). */
export type SqlParam = string | number | boolean | null | readonly number[];
export type SqlParams = ReadonlyArray<SqlParam>;

const QUERY_TIMEOUT_MS = 15_000;

function warnOnce(key: string, message: string): void {
  const seen = (globalThis.__pairadiceWarned ??= new Set<string>());
  if (seen.has(key)) return;
  seen.add(key);
  console.warn(message);
}

function readPort(): number {
  const raw = process.env.MYSQL_PORT;
  if (raw === undefined || raw === "") return 3306;
  const port = /^\d{1,5}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`MYSQL_PORT must be an integer between 1 and 65535 (got "${raw}").`);
  }
  return port;
}

function nonEmpty(v: string | undefined): string | undefined {
  return v === undefined || v === "" ? undefined : v;
}

function resolveCredentials(role: DbRole): { user: string; password: string } {
  const spec = DB_ROLE_ENV[role];
  const pwd = nonEmpty(process.env[spec.pwdVar]);
  // The MYSQL_USER/MYSQL_PWD stand-in (typically root) needs an explicit opt-in, development only.
  const fallbackAllowed = process.env.PAIRADICE_DEV_DB_FALLBACK === "1" && process.env.NODE_ENV === "development";
  let user: string;
  let password: string;
  if (pwd !== undefined) {
    user = nonEmpty(process.env[spec.userVar]) ?? spec.defaultUser;
    password = pwd;
  } else if (fallbackAllowed) {
    const fbPwd = nonEmpty(process.env.MYSQL_PWD);
    if (fbPwd === undefined) {
      throw new Error(
        `${spec.pwdVar} is not set for DB role "${role}" (and no MYSQL_PWD for the dev fallback). Start via \`bun run dev:kc\`; credentials are never stored in files.`,
      );
    }
    user = nonEmpty(process.env.MYSQL_USER) ?? "root";
    password = fbPwd;
    warnOnce(
      `fallback:${role}`,
      `[pairadice] ${spec.pwdVar} not set; DB role "${role}" falls back to MYSQL_USER/MYSQL_PWD (PAIRADICE_DEV_DB_FALLBACK=1, development only).`,
    );
  } else {
    throw new Error(
      `${spec.pwdVar} is not set for DB role "${role}". Start the app via \`bun run dev:kc\` (loads the per-role logins from the Keychain).`,
    );
  }
  if (user.toLowerCase() === "root" && !fallbackAllowed) {
    throw new Error(`Refusing to connect as root (DB role "${role}"); use the per-role logins (\`bun run dev:kc\`).`);
  }
  return { user, password };
}

function createPool(role: DbRole): Pool {
  const { user, password } = resolveCredentials(role);
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST ?? "127.0.0.1",
    port: readPort(),
    user,
    password,
    database: process.env.MYSQL_DATABASE ?? "pairadice",
    charset: "utf8mb4_0900_ai_ci",
    timezone: "Z",
    // keep DATETIME(6) as strings; DECIMALs as numbers (same as vector/src/db.js)
    dateStrings: true,
    decimalNumbers: true,
    stringifyObjects: true,
    connectionLimit: role === "web" ? 10 : 5,
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

/** Lazily created per-role pool; cached on globalThis so dev HMR does not leak connections. */
function poolFor(role: DbRole): Pool {
  const pools = (globalThis.__pairadicePools ??= new Map<DbRole, Pool>());
  let pool = pools.get(role);
  if (!pool) {
    pool = createPool(role);
    pools.set(role, pool);
  }
  return pool;
}

/** The "web" (anonymous, read-only) pool. */
export function getPool(): Pool {
  return poolFor("web");
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

/** Anything with mysql2's query(): a Pool or a PoolConnection. */
type Runner = Pick<Pool, "query">;

async function runQuery<T extends object>(r: Runner, sql: string, params: SqlParams): Promise<T[]> {
  checkParams(params);
  const [rows] = await r.query<Array<T & RowDataPacket>>({
    sql,
    values: [...params],
    timeout: QUERY_TIMEOUT_MS,
  });
  if (!Array.isArray(rows)) throw new Error("Unexpected MySQL result: expected a row array.");
  return rows;
}

async function runCall<T extends object>(r: Runner, sql: string, params: SqlParams): Promise<T[]> {
  checkParams(params);
  const [result] = await r.query<Array<Array<T & RowDataPacket>>>({
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

export interface ExecResult {
  affectedRows: number;
  insertId: number;
}

async function runExec(r: Runner, sql: string, params: SqlParams): Promise<ExecResult> {
  checkParams(params);
  const [res] = await r.query<ResultSetHeader>({
    sql,
    values: [...params],
    timeout: QUERY_TIMEOUT_MS,
  });
  if (Array.isArray(res)) throw new Error("Unexpected MySQL result: expected an OK packet.");
  return { affectedRows: res.affectedRows, insertId: res.insertId };
}

/** Run a parameterised SELECT as the given DB role. */
export function queryAs<T extends object>(role: DbRole, sql: string, params: SqlParams = []): Promise<T[]> {
  return runQuery<T>(poolFor(role), sql, params);
}

/**
 * Run a `CALL proc(...)` as the given DB role and return its first result set.
 * mysql2 returns [resultSet1, ..., OkPacket] for CALL; anything else is an error.
 */
export function callProcAs<T extends object>(role: DbRole, sql: string, params: SqlParams = []): Promise<T[]> {
  return runCall<T>(poolFor(role), sql, params);
}

/** Run a parameterised INSERT/UPDATE/DELETE as the given DB role. */
export function execAs(role: DbRole, sql: string, params: SqlParams = []): Promise<ExecResult> {
  return runExec(poolFor(role), sql, params);
}

/** A single pooled connection, with the same typing and param checks as the pool helpers. */
export interface DbConn {
  query<T extends object>(sql: string, params?: SqlParams): Promise<T[]>;
  exec(sql: string, params?: SqlParams): Promise<ExecResult>;
  callProc<T extends object>(sql: string, params?: SqlParams): Promise<T[]>;
}

function wrap(c: PoolConnection): DbConn {
  return {
    query: (sql, params = []) => runQuery(c, sql, params),
    exec: (sql, params = []) => runExec(c, sql, params),
    callProc: (sql, params = []) => runCall(c, sql, params),
  };
}

export interface ConnOptions {
  /** user_id recorded by audit triggers via @audit_actor for this connection's duration. */
  actorId?: number;
}

/**
 * Borrow one connection from the role's pool. If `actorId` is given,
 * `@audit_actor` is set first and ALWAYS cleared before the connection is released.
 * `fn` may call `markBroken()` (via the second argument) so the connection is destroyed, not reused.
 */
async function borrow<T>(
  role: DbRole,
  fn: (c: DbConn, markBroken: () => void) => Promise<T>,
  opts: ConnOptions,
): Promise<T> {
  const conn = await poolFor(role).getConnection();
  const db = wrap(conn);
  let broken = false;
  try {
    if (opts.actorId !== undefined) await db.exec("SET @audit_actor = ?", [opts.actorId]);
    return await fn(db, () => {
      broken = true;
    });
  } finally {
    if (!broken && opts.actorId !== undefined) {
      try {
        await db.exec("SET @audit_actor = NULL");
      } catch {
        // connection is unusable; drop it rather than return it with a stale actor
        broken = true;
      }
    }
    if (broken) conn.destroy();
    else conn.release();
  }
}

export function withConnection<T>(
  role: DbRole,
  fn: (c: DbConn) => Promise<T>,
  opts: ConnOptions = {},
): Promise<T> {
  return borrow(role, (c) => fn(c), opts);
}

/**
 * Like {@link withConnection} but wrapped in BEGIN/COMMIT (ROLLBACK if `fn` throws).
 * If ROLLBACK or COMMIT itself fails the connection is destroyed, never pooled.
 *
 * WARNING: never call `sp_accept_participant` inside this; that procedure
 * commits its own transaction and would break the atomicity you expect here.
 */
export function withTransaction<T>(
  role: DbRole,
  fn: (c: DbConn) => Promise<T>,
  opts: ConnOptions = {},
): Promise<T> {
  return borrow(
    role,
    async (c, markBroken) => {
      await c.exec("START TRANSACTION");
      let out: T;
      try {
        out = await fn(c);
      } catch (err) {
        try {
          await c.exec("ROLLBACK");
        } catch {
          markBroken(); // unknown transaction state; original error matters more
        }
        throw err;
      }
      try {
        await c.exec("COMMIT");
      } catch (err) {
        markBroken();
        throw err;
      }
      return out;
    },
    opts,
  );
}

/** A database-raised, user-presentable error (trigger SIGNAL or duplicate key). */
export class DbBusinessError extends Error {
  readonly sqlState: string;
  readonly errno: number;
  constructor(message: string, sqlState: string, errno: number) {
    super(message);
    this.name = "DbBusinessError";
    this.sqlState = sqlState;
    this.errno = errno;
  }
}

interface MysqlErrorLike {
  errno?: unknown;
  sqlState?: unknown;
  sqlMessage?: unknown;
}

/**
 * Recognise trigger-raised business errors (errno 1644 / SQLSTATE 45000) and
 * duplicate keys (1062). Anything else returns null; never leak other DB text.
 */
export function toBusinessError(err: unknown): DbBusinessError | null {
  if (err instanceof DbBusinessError) return err;
  if (typeof err !== "object" || err === null) return null;
  const e = err as MysqlErrorLike;
  const errno = typeof e.errno === "number" ? e.errno : undefined;
  const state = typeof e.sqlState === "string" ? e.sqlState : "";
  if (errno === 1644 || state === "45000") {
    const msg = typeof e.sqlMessage === "string" && e.sqlMessage !== "" ? e.sqlMessage : "That action is not allowed.";
    return new DbBusinessError(msg, state || "45000", errno ?? 1644);
  }
  if (errno === 1062) {
    return new DbBusinessError("That already exists.", state || "23000", 1062);
  }
  return null;
}

/** Run a parameterised SELECT as the anonymous "web" role. */
export function query<T extends object>(sql: string, params: SqlParams = []): Promise<T[]> {
  return queryAs<T>("web", sql, params);
}

/** Run a `CALL` as the anonymous "web" role and return its first result set. */
export function callProc<T extends object>(sql: string, params: SqlParams = []): Promise<T[]> {
  return callProcAs<T>("web", sql, params);
}
