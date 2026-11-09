import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SignUpForm } from "@/components/auth/SignUpForm";
import { TitleScreen } from "@/components/auth/TitleScreen";
import { Window } from "@/components/ui";
import { getViewer } from "@/lib/auth/viewer";

export const metadata: Metadata = { title: "Create account | PairADice" };

export default async function SignUpPage() {
  const viewer = await getViewer();
  if (viewer?.source === "session") redirect("/hearth");
  return (
    <TitleScreen tagline="Press start to make a character">
      <Window title="New game" titleAs="p" variant="parchment" className="w-full">
        <h1 className="mb-4 font-display text-2xl font-bold text-ink">Join the party</h1>
        <SignUpForm />
      </Window>
    </TitleScreen>
  );
}
