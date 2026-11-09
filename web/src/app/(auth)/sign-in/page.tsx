import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/SignInForm";
import { TitleScreen } from "@/components/auth/TitleScreen";
import { Window } from "@/components/ui";
import { getViewer } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "Sign in | PairADice" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const viewer = await getViewer();
  if (viewer?.source === "session") redirect("/hearth");
  const { next } = await searchParams;
  const nextPath = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
  return (
    <TitleScreen tagline="Press start to enter the cabin">
      <Window title="Sign in" titleAs="p" variant="parchment" className="w-full">
        <h1 className="mb-4 font-display text-2xl font-bold text-ink">Welcome back, traveller</h1>
        <SignInForm next={nextPath} />
      </Window>
    </TitleScreen>
  );
}
