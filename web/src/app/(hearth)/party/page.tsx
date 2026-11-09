import type { Metadata } from "next";
import { PartyGroups } from "@/components/hearth/PartyGroups";
import { SignInGate } from "@/components/hearth/SignInGate";
import { getViewer } from "@/lib/auth/viewer";
import { getCurrentUser, getMyParty } from "@/lib/queries";

export const metadata: Metadata = { title: "My Party | PairADice" };

export default async function PartyPage() {
  const [user, viewer] = await Promise.all([getCurrentUser(), getViewer()]);
  if (!user || !viewer) return <SignInGate />;
  const entries = await getMyParty(viewer);
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-display text-3xl font-bold [text-shadow:0_2px_0_var(--color-ink)]">My Party</h1>
        <p className="text-lavender">Quests you are hosting, adventuring in, or waiting to join.</p>
      </header>
      <PartyGroups entries={entries} timeZone={user.timezone} />
    </div>
  );
}
