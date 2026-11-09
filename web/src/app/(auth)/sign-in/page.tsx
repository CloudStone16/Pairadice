import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/SignInForm";
import { TitleScreen } from "@/components/auth/TitleScreen";
import { Window } from "@/components/ui";
import { isDiscordEnabled, redirectUri } from "@/lib/auth/discord-core";
import { safeNextOrNull } from "@/lib/auth/safe-next";
import { getViewer } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "Sign in | PairADice" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; error?: string | string[] }> }) {
  const viewer = await getViewer();
  if (viewer?.source === "session") redirect("/hearth");
  const { next, error } = await searchParams;
  const discordEnabled = isDiscordEnabled(process.env) && redirectUri(process.env) !== null;
  const discordError =
    error === "discord" ? "Discord sign-in did not finish. Please try again."
    : error === "discord_refused" ? "This account cannot sign in."
    : undefined;
  const nextPath = safeNextOrNull(typeof next === "string" ? next : null) ?? undefined;
  return (
    <TitleScreen tagline="Press start to enter the cabin">
      <Window title="Sign in" titleAs="p" variant="parchment" className="w-full">
        <h1 className="mb-4 font-display text-2xl font-bold text-ink">Welcome back, traveller</h1>
        <SignInForm next={nextPath} discordEnabled={discordEnabled} discordError={discordError} />
      </Window>
    </TitleScreen>
  );
}
