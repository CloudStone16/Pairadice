// Shared MySQL pool and MongoDB client (lazily opened, closed by closeAll()).
import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';
import { config, COLLECTIONS } from './config.js';

let pool;
let client;

export function sql() {
  if (!pool) {
    if (config.mysql.password === undefined && !config.mysql.socketPath) {
      throw new Error('Set MYSQL_PWD or MYSQL_SOCKET (and MYSQL_USER if not root) in the environment; credentials are never stored in files.');
    }
    // dateStrings keeps DATETIME(6) microseconds intact (outbox rows are matched on enqueued_at)
    pool = mysql.createPool({
      ...config.mysql, charset: 'utf8mb4_0900_ai_ci', timezone: 'Z',
      dateStrings: true, decimalNumbers: true, connectionLimit: 4,
    });
    // every DATETIME in the schema is UTC; make the session agree (same as web/src/lib/db.ts)
    pool.pool.on('connection', (conn) => {
      conn.query("SET time_zone = '+00:00'", (err) => {
        if (err) console.error('could not set session time_zone:', err.message);
      });
    });
  }
  return pool;
}

export async function mongo() {
  if (!client) {
    client = new MongoClient(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
  }
  return client.db(config.mongoDb);
}

export async function collections() {
  const db = await mongo();
  return { players: db.collection(COLLECTIONS.players), sessions: db.collection(COLLECTIONS.sessions) };
}

export async function closeAll() {
  await Promise.all([pool?.end(), client?.close()]);
  pool = undefined;
  client = undefined;
}
