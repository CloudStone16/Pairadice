import { describe, expect, test } from "bun:test";
import {
  base64url,
  buildAuthorizeUrl,
  codeChallenge,
  decodeCookiePayload,
  discordCookieName,
  discordCookieOptions,
  encodeCookiePayload,
  isDiscordEnabled,
  newCodeVerifier,
  parseIdentity,
  appUrl,
  redirectUri,
  safeEqual,
  sanitizeTimezone,
} from "./discord-core";

const good = { state: "a".repeat(43), verifier: "b".repeat(43), next: "/hearth" };

describe("pkce and state", () => {
  test("known S256 vector", async () => {
    expect(await codeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });
  test("verifier is 43 url-safe chars and random", () => {
    const v = newCodeVerifier();
    expect(v).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newCodeVerifier()).not.toBe(v);
  });
  test("base64url has no padding or unsafe chars", () => {
    expect(base64url(new Uint8Array([251, 255, 254]))).toBe("-__-");
  });
  test("safeEqual", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("authorize url", () => {
  test("has the required parameters", () => {
    const u = new URL(buildAuthorizeUrl({ clientId: "123", redirectUri: "http://127.0.0.1:3000/auth/discord/callback", state: "st", challenge: "ch" }));
    expect(u.origin + u.pathname).toBe("https://discord.com/oauth2/authorize");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("123");
    expect(u.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:3000/auth/discord/callback");
    expect(u.searchParams.get("scope")).toBe("identify");
    expect(u.searchParams.get("state")).toBe("st");
    expect(u.searchParams.get("code_challenge")).toBe("ch");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.has("prompt")).toBe(false);
  });
});

describe("flag gating", () => {
  test("needs the flag and both credentials", () => {
    const on = { PAIRADICE_DISCORD_LOGIN: "1", DISCORD_CLIENT_ID: "id", DISCORD_CLIENT_SECRET: "s" };
    expect(isDiscordEnabled(on)).toBe(true);
    expect(isDiscordEnabled({ ...on, PAIRADICE_DISCORD_LOGIN: "true" })).toBe(false);
    expect(isDiscordEnabled({ ...on, PAIRADICE_DISCORD_LOGIN: undefined })).toBe(false);
    expect(isDiscordEnabled({ ...on, DISCORD_CLIENT_ID: "" })).toBe(false);
    expect(isDiscordEnabled({ ...on, DISCORD_CLIENT_SECRET: "  " })).toBe(false);
    expect(isDiscordEnabled({})).toBe(false);
  });
  test("redirect uri", () => {
    expect(redirectUri({ NODE_ENV: "development" })).toBe("http://127.0.0.1:3000/auth/discord/callback");
    expect(redirectUri({ NODE_ENV: "production" })).toBeNull();
    expect(redirectUri({ NODE_ENV: "production", PAIRADICE_PUBLIC_URL: "not a url" })).toBeNull();
    expect(redirectUri({ NODE_ENV: "production", PAIRADICE_PUBLIC_URL: "http://x.example" })).toBeNull();
    expect(redirectUri({ NODE_ENV: "production", PAIRADICE_PUBLIC_URL: "ftp://x.example" })).toBeNull();
    expect(redirectUri({ NODE_ENV: "development", PAIRADICE_PUBLIC_URL: "http://x.example" })).toBe(
      "http://127.0.0.1:3000/auth/discord/callback",
    );
    expect(redirectUri({ NODE_ENV: "production", PAIRADICE_PUBLIC_URL: "https://x.example/ignored" })).toBe(
      "https://x.example/auth/discord/callback",
    );
  });
  test("cookie name and options", () => {
    expect(discordCookieName({ NODE_ENV: "production" })).toBe("__Host-pd_discord");
    expect(discordCookieOptions({ NODE_ENV: "production" })).toMatchObject({ path: "/", secure: true, httpOnly: true, maxAge: 600 });
    expect(discordCookieName({})).toBe("pd_discord");
    expect(discordCookieOptions({})).toMatchObject({ path: "/auth", secure: false, sameSite: "lax" });
  });
});

describe("identity", () => {
  test("keeps only id, username, global_name", () => {
    expect(parseIdentity({ id: "80351110224678912", username: "nelly", global_name: "Nelly", email: "x@y.z" })).toEqual({
      id: "80351110224678912",
      username: "nelly",
      globalName: "Nelly",
    });
    expect(parseIdentity({ id: "80351110224678912", username: "n", global_name: null })?.globalName).toBeNull();
  });
  test("rejects bad ids and shapes", () => {
    for (const id of ["1234567890123456", "123456789012345678901", "1234567890123456a", 80351110224678912, null, ""]) {
      expect(parseIdentity({ id, username: "n" })).toBeNull();
    }
    expect(parseIdentity({ id: "80351110224678912" })).toBeNull();
    expect(parseIdentity(null)).toBeNull();
    expect(parseIdentity("x")).toBeNull();
  });
});

describe("timezone", () => {
  test("same rule as sign-up", () => {
    expect(sanitizeTimezone("Europe/Berlin")).toBe("Europe/Berlin");
    expect(sanitizeTimezone("Mars/Base")).toBe("UTC");
    expect(sanitizeTimezone("")).toBe("UTC");
    expect(sanitizeTimezone("x".repeat(65))).toBe("UTC");
  });
});

describe("cookie payload", () => {
  test("round trips", () => {
    expect(decodeCookiePayload(encodeCookiePayload(good))).toEqual(good);
  });
  test("rejects missing, oversized, non-base64, non-JSON", () => {
    expect(decodeCookiePayload(undefined)).toBeNull();
    expect(decodeCookiePayload("")).toBeNull();
    expect(decodeCookiePayload("A".repeat(5000))).toBeNull();
    expect(decodeCookiePayload("not base64!")).toBeNull();
    expect(decodeCookiePayload(base64url(new TextEncoder().encode("nope")))).toBeNull();
  });
  test("rejects tampered contents", () => {
    const enc = (o: unknown) => base64url(new TextEncoder().encode(JSON.stringify(o)));
    expect(decodeCookiePayload(enc({ s: "short", v: good.verifier, n: "/hearth" }))).toBeNull();
    expect(decodeCookiePayload(enc({ s: good.state, v: "bad value!!!!!!!!!!!!", n: "/hearth" }))).toBeNull();
    expect(decodeCookiePayload(enc({ s: good.state, v: good.verifier, n: "//evil.example" }))).toBeNull();
    expect(decodeCookiePayload(enc({ s: good.state, v: good.verifier, n: "https://evil.example" }))).toBeNull();
    expect(decodeCookiePayload(enc({ s: good.state, v: good.verifier }))).toBeNull();
    expect(decodeCookiePayload(enc([1, 2]))).toBeNull();
    const ok = encodeCookiePayload(good);
    expect(decodeCookiePayload(ok.slice(0, -3) + "!!!")).toBeNull();
  });
});

test("appUrl builds redirects on the configured origin only", () => {
  const uri = "https://x.example/auth/discord/callback";
  expect(appUrl(uri, "/sign-in?error=discord")).toBe("https://x.example/sign-in?error=discord");
  expect(appUrl(uri, "/camps/3")).toBe("https://x.example/camps/3");
  expect(appUrl(uri, "//evil.example")).toBe("https://x.example/");
  expect(appUrl(uri, "/\\evil.example")).toBe("https://x.example/");
  expect(appUrl(uri, "https://evil.example")).toBe("https://x.example/");
});

