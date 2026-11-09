import { createHmac, randomBytes } from "node:crypto";

declare global {
  var __pairadiceDevAuthSecret: string | undefined;
}

const MIN_SECRET_BYTES = 32;

function authSecret(): string {
  const env = process.env.AUTH_SECRET;
  if (env !== undefined && env !== "") {
    if (Buffer.byteLength(env, "utf8") < MIN_SECRET_BYTES) {
      throw new Error(`AUTH_SECRET must be at least ${MIN_SECRET_BYTES} bytes (try: openssl rand -base64 48).`);
    }
    return env;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(`AUTH_SECRET is required in production (at least ${MIN_SECRET_BYTES} bytes; openssl rand -base64 48).`);
  }
  if (!globalThis.__pairadiceDevAuthSecret) {
    globalThis.__pairadiceDevAuthSecret = randomBytes(48).toString("base64");
    console.warn("[pairadice] AUTH_SECRET is not set; using a random per-process secret. Sessions end when the server restarts.");
  }
  return globalThis.__pairadiceDevAuthSecret;
}

/** 32 random bytes as base64url (43 chars). Only ever stored in the cookie. */
export function newRawToken(): string {
  return randomBytes(32).toString("base64url");
}

/** HMAC-SHA256(raw, AUTH_SECRET) as 32 bytes, for auth_token.token_hash BINARY(32). */
export function hashToken(raw: string): Buffer {
  return createHmac("sha256", authSecret()).update(raw).digest();
}

/** True for a well-formed raw token (43 base64url characters); anything else cannot be a session. */
export function isValidRawToken(raw: string | null | undefined): raw is string {
  return typeof raw === "string" && /^[A-Za-z0-9_-]{43}$/.test(raw);
}
