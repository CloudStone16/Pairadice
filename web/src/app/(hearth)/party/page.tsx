import type { Metadata } from "next";
import { PartyGroups } from "@/components/hearth/PartyGroups";
import { dbRoleFor, requireViewerUser } from "@/lib/auth/guards";
import { getMyParty } from "@/lib/queries";

export const metadata: Metadata = { title: "My Party | PairADice" };

export default async function PartyPage() {
  const { session, user } = await requireViewerUser("/party");
  const entries = await getMyParty(user.user_id, dbRoleFor(session));
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
