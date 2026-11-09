import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/SignInForm";
import { TitleHeader } from "@/components/auth/TitleHeader";
import { Window } from "@/components/ui";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Sign in · PairADice" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const session = await getSession();
  if (session && !session.dev) redirect("/hearth");
  const { next } = await searchParams;
  return (
    <>
      <TitleHeader heading="Press Start" />
      <Window variant="parchment" titleAs="p" title="Sign in">
        <SignInForm
          next={typeof next === "string" ? next : undefined}
          discordEnabled={process.env.PAIRADICE_DISCORD === "1"}
        />
      </Window>
    </>
  );
}
