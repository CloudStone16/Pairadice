import "server-only";
import { MongoClient, type Collection, type Document } from "mongodb";

// Read-only MongoDB access for the vector store. Only find/aggregate are ever called from here.

declare global {
  var __pairadiceMongo: MongoClient | undefined;
  var __pairadiceMongoDownUntil: number | undefined;
}

/** Local development default only; production must set MONGO_URI (the URI itself is never logged). */
const DEV_DEFAULT_URI = "mongodb://127.0.0.1:27018/?directConnection=true";
/** After a failure, fail fast for this long instead of paying the selection timeout on every call. */
const COOLDOWN_MS = 10_000;

export const COLLECTION_NAMES = { players: "player_embeddings", sessions: "session_embeddings" } as const;
export const INDEX_NAMES = { players: "player_vec_idx", sessions: "session_vec_idx" } as const;
export type VectorKind = keyof typeof COLLECTION_NAMES;

function mongoUri(): string {
  const uri = process.env.MONGO_URI;
  if (uri) return uri;
  if (process.env.NODE_ENV === "production") {
    throw new Error("MONGO_URI is required in production (no default; set it in the environment).");
  }
  return DEV_DEFAULT_URI;
}

function client(): MongoClient {
  return (globalThis.__pairadiceMongo ??= new MongoClient(mongoUri(), {
    serverSelectionTimeoutMS: 1500,
    connectTimeoutMS: 1500,
    socketTimeoutMS: 5000,
    maxPoolSize: 5,
    appName: "pairadice-web",
  }));
}

/** A collection handle, or a rejected promise (fast during the cooldown) when MongoDB is unreachable. */
export async function vectorCollection(kind: VectorKind): Promise<Collection<Document>> {
  if ((globalThis.__pairadiceMongoDownUntil ?? 0) > Date.now()) throw new Error("MongoDB unavailable (cooling down)");
  return client().db(process.env.MONGO_DB || "pairadice_vec").collection(COLLECTION_NAMES[kind]);
}

/** Run a Mongo operation; on failure start the cooldown so the rest of the page fails fast. */
export async function withMongo<T>(kind: VectorKind, fn: (c: Collection<Document>) => Promise<T>): Promise<T> {
  const coll = await vectorCollection(kind);
  try {
    return await fn(coll);
  } catch (err) {
    globalThis.__pairadiceMongoDownUntil = Date.now() + COOLDOWN_MS;
    throw err;
  }
}
