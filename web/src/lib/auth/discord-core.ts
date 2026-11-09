// Pure Discord OAuth helpers (no server-only import: unit-testable). Nothing here logs or stores secrets.
import { safeNextOrNull } from "./safe-next";
import { validTimezone } from "./timezone";

export { validTimezone as sanitizeTimezone };

/** PKCE is not documented for Discord's code grant; it is sent as defence in depth. Switch off if Discord rejects it. */
export const DISCORD_PKCE = true;

export const DISCORD_AUTHORIZE_URL = "https://discord.com/oauth2/authorize";
export const DISCORD_TOKEN_URL = "https://discord.com/api/v10/oauth2/token";
export const DISCORD_ME_URL = "https://discord.com/api/v10/users/@me";
export const DISCORD_SCOPE = "identify";
export const DISCORD_COOKIE_MAX_AGE_SECONDS = 600;
export const MAX_COOKIE_VALUE_LENGTH = 4096;

export const DISCORD_ERROR_GENERIC = "discord";
export const DISCORD_ERROR_REFUSED = "discord_refused";

export function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const B64URL_RE = /^[A-Za-z0-9_-]*$/;

export function base64urlDecode(text: string): Uint8Array | null {
  if (!B64URL_RE.test(text) || text.length % 4 === 1) return null;
  try {
    const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export const newCodeVerifier = (): string => randomToken(32);
export const newState = (): string => randomToken(32);

export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/** Constant-time for equal-length inputs; a length mismatch returns early (lengths are not secret here). */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export interface DiscordEnv {
  PAIRADICE_DISCORD_LOGIN?: string;
  DISCORD_CLIENT_ID?: string;
  DISCORD_CLIENT_SECRET?: string;
  PAIRADICE_PUBLIC_URL?: string;
  NODE_ENV?: string;
}

export function isDiscordEnabled(env: DiscordEnv): boolean {
  return (
    env.PAIRADICE_DISCORD_LOGIN === "1" &&
    (env.DISCORD_CLIENT_ID ?? "").trim() !== "" &&
    (env.DISCORD_CLIENT_SECRET ?? "").trim() !== ""
  );
}

const CALLBACK_PATH = "/auth/discord/callback";

/** Development: the fixed loopback URI. Production: PAIRADICE_PUBLIC_URL (https origin only) or null (refuse). */
export function redirectUri(env: DiscordEnv): string | null {
  if (env.NODE_ENV !== "production") return `http://127.0.0.1:3000${CALLBACK_PATH}`;
  const raw = (env.PAIRADICE_PUBLIC_URL ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    return `${u.origin}${CALLBACK_PATH}`;
  } catch {
    return null;
  }
}

/** Absolute URL for an app path on the origin of the configured redirect URI (never the request's host). */
export function appUrl(redirectUriValue: string, path: string): string {
  const safePath = /^\/(?![/\\])/.test(path) ? path : "/";
  return new URL(safePath, new URL(redirectUriValue).origin).toString();
}

export function buildAuthorizeUrl(p: { clientId: string; redirectUri: string; state: string; challenge?: string }): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    scope: DISCORD_SCOPE,
    state: p.state,
  });
  if (DISCORD_PKCE && p.challenge) {
    q.set("code_challenge", p.challenge);
    q.set("code_challenge_method", "S256");
  }
  return `${DISCORD_AUTHORIZE_URL}?${q.toString()}`;
}

export interface DiscordIdentity {
  id: string;
  username: string;
  globalName: string | null;
}

/** Keep only id, username, global_name; id must be a snowflake (17-20 digits). */
export function parseIdentity(body: unknown): DiscordIdentity | null {
  if (typeof body !== "object" || body === null) return null;
  const o = body as Record<string, unknown>;
  if (typeof o.id !== "string" || !/^[0-9]{17,20}$/.test(o.id)) return null;
  if (typeof o.username !== "string") return null;
  const clip = (s: string, n: number) => s.trim().slice(0, n);
  const globalName = typeof o.global_name === "string" && o.global_name.trim() !== "" ? clip(o.global_name, 64) : null;
  return { id: o.id, username: clip(o.username, 64), globalName };
}

/** Pulls access_token out of a token response; null if absent or not a plausible string. */
export function parseAccessToken(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const t = (body as Record<string, unknown>).access_token;
  return typeof t === "string" && t.length > 0 && t.length <= 512 ? t : null;
}

export interface DiscordCookiePayload {
  state: string;
  verifier: string;
  next: string;
}

const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

export function encodeCookiePayload(p: DiscordCookiePayload): string {
  return base64url(new TextEncoder().encode(JSON.stringify({ s: p.state, v: p.verifier, n: p.next })));
}

export function decodeCookiePayload(raw: string | null | undefined): DiscordCookiePayload | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_COOKIE_VALUE_LENGTH) return null;
  const bytes = base64urlDecode(raw);
  if (!bytes) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.s !== "string" || typeof o.v !== "string" || typeof o.n !== "string") return null;
  if (!TOKEN_RE.test(o.s) || !TOKEN_RE.test(o.v)) return null;
  const next = safeNextOrNull(o.n);
  if (next === null) return null;
  return { state: o.s, verifier: o.v, next };
}

export function discordCookieName(env: DiscordEnv): string {
  return env.NODE_ENV === "production" ? "__Host-pd_discord" : "pd_discord";
}

export function discordCookieOptions(env: DiscordEnv) {
  const prod = env.NODE_ENV === "production";
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: prod ? "/" : "/auth", // the __Host- prefix requires Path=/
    secure: prod,
    maxAge: DISCORD_COOKIE_MAX_AGE_SECONDS,
  };
}
