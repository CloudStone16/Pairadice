// Shared MySQL pool and MongoDB client (lazily opened, closed by closeAll()).
import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';
import { config, COLLECTIONS } from './config.js';

let pool;
let client;

export function sql() {
  if (!pool) {
    if (config.mysql.password === undefined) {
      throw new Error('Set MYSQL_PWD (and MYSQL_USER if not root) in the environment; credentials are never stored in files.');
    }
    // dateStrings keeps DATETIME(6) microseconds intact (outbox rows are matched on enqueued_at)
    // utf8mb4 + UTC on every connection so text and timestamps round-trip the same way as the web app
    pool = mysql.createPool({
      ...config.mysql, charset: 'UTF8MB4_0900_AI_CI', timezone: 'Z',
      dateStrings: true, decimalNumbers: true, connectionLimit: 4,
    });
    pool.pool.on('connection', (conn) => conn.query("SET time_zone = '+00:00'"));
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
