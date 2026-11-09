import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse, type NextRequest } from "next/server";
import { clientIp } from "@/lib/auth/client-ip";
import { discordLogin, identityFromCode } from "@/lib/auth/discord";
import {
  DISCORD_ERROR_GENERIC,
  DISCORD_ERROR_REFUSED,
  appUrl,
  decodeCookiePayload,
  discordCookieName,
  discordCookieOptions,
  isDiscordEnabled,
  redirectUri,
  safeEqual,
} from "@/lib/auth/discord-core";
import { countAttempt, discordLimits } from "@/lib/auth/rate-limit";
import { startSession } from "@/lib/auth/session";
import { describeError } from "@/lib/auth/signup-errors";

export const dynamic = "force-dynamic";

// Cookies are all written through cookies() (the one-time pd_discord cookie is cleared up front, startSession sets
// the session cookie), and every exit is next/navigation redirect(): the Next.js 16 docs (01-app/03-api-reference/
// 03-file-conventions/route.md "Cookies" and 04-functions/cookies.md) do not say cookies() writes are merged into a
// separately returned NextResponse, so we never return our own redirect response after touching cookies().
// Targets are absolute URLs on the configured public origin, never request.nextUrl / the Host header.
// redirect() throws, so it must stay outside try/catch.
function fail(uri: string, error: string = DISCORD_ERROR_GENERIC): never {
  redirect(appUrl(uri, `/sign-in?error=${error}`));
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const env = process.env;
  const uri = redirectUri(env);
  if (!isDiscordEnabled(env) || !uri) return new NextResponse(null, { status: 404 });

  // read AND delete the one-time cookie before anything else
  const jar = await cookies();
  const name = discordCookieName(env);
  const stored = decodeCookiePayload(jar.get(name)?.value);
  jar.set(name, "", { ...discordCookieOptions(env), maxAge: 0 });

  const q = request.nextUrl.searchParams;
  const state = q.get("state");
  const code = q.get("code");
  if (!stored || q.has("error") || !state || !safeEqual(state, stored.state) || !code || code.length > 512) {
    fail(uri);
  }
  if (!countAttempt(discordLimits("callback", await clientIp())).ok) fail(uri);

  const identity = await identityFromCode({
    code,
    verifier: stored.verifier,
    redirectUri: uri,
    clientId: (env.DISCORD_CLIENT_ID ?? "").trim(),
    clientSecret: env.DISCORD_CLIENT_SECRET ?? "",
  });
  if (!identity) fail(uri);

  const result = await discordLogin(identity, "UTC");
  if (!result.ok) fail(uri, result.refused ? DISCORD_ERROR_REFUSED : DISCORD_ERROR_GENERIC);

  let started = false;
  try {
    await startSession(result.userId, (await headers()).get("user-agent"));
    started = true;
  } catch (err) {
    console.error("[discord] could not start a session:", describeError(err));
  }
  if (!started) fail(uri);
  redirect(appUrl(uri, stored.next));
}
