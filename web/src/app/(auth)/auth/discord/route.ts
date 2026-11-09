import { NextResponse, type NextRequest } from "next/server";
import { clientIp } from "@/lib/auth/client-ip";
import {
  appUrl,
  buildAuthorizeUrl,
  codeChallenge,
  discordCookieName,
  discordCookieOptions,
  encodeCookiePayload,
  isDiscordEnabled,
  newCodeVerifier,
  newState,
  redirectUri,
} from "@/lib/auth/discord-core";
import { countAttempt, discordLimits } from "@/lib/auth/rate-limit";
import { safeNext } from "@/lib/auth/safe-next";

export const dynamic = "force-dynamic";

function notFound(): NextResponse {
  return new NextResponse(null, { status: 404 });
}

// Built from the configured public origin, never from request.nextUrl (proxy / Host header safe).
function backToSignIn(uri: string, error: string): NextResponse {
  return NextResponse.redirect(appUrl(uri, `/sign-in?error=${error}`), 302);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const env = process.env;
  const uri = redirectUri(env);
  if (!isDiscordEnabled(env) || !uri) return notFound();
  if (!countAttempt(discordLimits("start", await clientIp())).ok) return backToSignIn(uri, "discord");

  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const state = newState();
  const verifier = newCodeVerifier();
  const url = buildAuthorizeUrl({
    clientId: (env.DISCORD_CLIENT_ID ?? "").trim(),
    redirectUri: uri,
    state,
    challenge: await codeChallenge(verifier),
  });

  const res = NextResponse.redirect(url, 302);
  res.cookies.set(discordCookieName(env), encodeCookiePayload({ state, verifier, next }), discordCookieOptions(env));
  res.headers.set("Cache-Control", "no-store");
  return res;
}
