import "server-only";
import type { RowDataPacket } from "mysql2";
import { transactionAs } from "@/lib/db";
import {
  DISCORD_ME_URL,
  DISCORD_PKCE,
  DISCORD_TOKEN_URL,
  parseAccessToken,
  parseIdentity,
  sanitizeTimezone,
  type DiscordIdentity,
} from "./discord-core";
import { describeError } from "./signup-errors";

const TIMEOUT_MS = 8000;

/** Exchange the code for an access token. Logs status codes only. Returns null on any failure. */
async function exchangeCode(p: {
  code: string;
  verifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<string | null> {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code: p.code,
    redirect_uri: p.redirectUri,
  });
  if (DISCORD_PKCE) form.set("code_verifier", p.verifier);
  const basic = Buffer.from(`${p.clientId}:${p.clientSecret}`).toString("base64");
  try {
    const res = await fetch(DISCORD_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}`, Accept: "application/json" },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[discord] token exchange failed: HTTP ${res.status}`);
      return null;
    }
    return parseAccessToken(await res.json());
  } catch (err) {
    console.error("[discord] token exchange error:", err instanceof Error ? err.name : "unknown");
    return null;
  }
}

async function fetchIdentity(accessToken: string): Promise<DiscordIdentity | null> {
  try {
    const res = await fetch(DISCORD_ME_URL, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`[discord] identity fetch failed: HTTP ${res.status}`);
      return null;
    }
    return parseIdentity(await res.json());
  } catch (err) {
    console.error("[discord] identity fetch error:", err instanceof Error ? err.name : "unknown");
    return null;
  }
}

/** Code -> identity; the access token never leaves this function. */
export async function identityFromCode(p: {
  code: string;
  verifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}): Promise<DiscordIdentity | null> {
  const token = await exchangeCode(p);
  if (!token) return null;
  return fetchIdentity(token);
}

export type DiscordLoginResult = { ok: true; userId: number } | { ok: false; refused: boolean; message: string };

const REFUSAL_MESSAGES = new Set(["This account cannot sign in.", "Your account cannot do that right now."]);

/** sp_discord_login(p_discord_id, p_username_hint, p_display_hint, p_timezone, OUT p_user_id). */
export async function discordLogin(identity: DiscordIdentity, timezone: string): Promise<DiscordLoginResult> {
  try {
    const userId = await transactionAs("auth", async (conn) => {
      await conn.query("CALL sp_discord_login(?, ?, ?, ?, @pd_discord_uid)", [
        identity.id,
        identity.username,
        identity.globalName ?? identity.username,
        sanitizeTimezone(timezone),
      ]);
      const [rows] = await conn.query<Array<{ id: number | string | null } & RowDataPacket>>("SELECT @pd_discord_uid AS id");
      const id = Number(rows[0]?.id);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error("sp_discord_login returned no id");
      return id;
    });
    return { ok: true, userId };
  } catch (err) {
    const e = typeof err === "object" && err !== null ? (err as { sqlState?: unknown; sqlMessage?: unknown }) : {};
    if (e.sqlState === "45000" && typeof e.sqlMessage === "string" && REFUSAL_MESSAGES.has(e.sqlMessage)) {
      return { ok: false, refused: true, message: "This account cannot sign in." };
    }
    console.error("[discord] login procedure failed:", describeError(err));
    return { ok: false, refused: false, message: "Discord sign-in did not finish. Please try again." };
  }
}
