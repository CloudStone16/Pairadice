import { createHmac, randomBytes } from "node:crypto";

const RAW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** True when `raw` has the shape newRawToken() produces (43 base64url chars). */
export function isValidRawToken(raw: unknown): raw is string {
  return typeof raw === "string" && RAW_TOKEN_PATTERN.test(raw);
}

/** 32 random bytes, base64url (43 chars). This is what goes in the cookie. */
export function newRawToken(): string {
  return randomBytes(32).toString("base64url");
}

function readSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret === undefined || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or shorter than 32 characters. Start via `bun run dev:kc` or export it in the shell; it is never stored in files.",
    );
  }
  return secret;
}

/** HMAC-SHA256(raw, AUTH_SECRET): the 32 bytes stored in auth_token.token_hash. */
export function hashToken(raw: string): Buffer {
  if (!isValidRawToken(raw)) throw new Error("Malformed session token.");
  return createHmac("sha256", readSecret()).update(raw).digest();
}
