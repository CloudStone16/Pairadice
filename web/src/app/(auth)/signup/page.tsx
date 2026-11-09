import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { TitleHeader } from "@/components/auth/TitleHeader";
import { Window } from "@/components/ui";
import { getSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Create a character · PairADice" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const session = await getSession();
  if (session && !session.dev) redirect("/hearth");
  const { next } = await searchParams;
  return (
    <>
      <TitleHeader heading="New Game" />
      <Window variant="parchment" titleAs="p" title="Create a character">
        <SignUpForm
          next={typeof next === "string" ? next : undefined}
          discordEnabled={process.env.PAIRADICE_DISCORD === "1"}
        />
      </Window>
    </>
  );
}
