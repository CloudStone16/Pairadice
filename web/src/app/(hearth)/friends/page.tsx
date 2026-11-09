import type { Metadata } from "next";
import { FriendList } from "@/components/hearth/FriendList";
import { dbRoleFor, requireUser } from "@/lib/auth/guards";
import { getFriendLists } from "@/lib/queries";

export const metadata: Metadata = { title: "Friends | PairADice" };

export default async function FriendsPage() {
  const session = await requireUser("/friends");
  const { accepted, incoming, outgoing } = await getFriendLists(session.userId, dbRoleFor(session));
  return (
    <div className="flex flex-col gap-10">
      <header>
        <h1 className="font-display text-3xl font-bold [text-shadow:0_2px_0_var(--color-ink)]">Friends</h1>
        <p className="text-lavender">The folks you share a fire with.</p>
      </header>
      <FriendList title="Friends" friends={accepted} empty="No friends yet. Good company is on the Quest Board." />
      <FriendList title="Waiting on you" friends={incoming} empty="No pending requests from others." />
      <FriendList title="Waiting on them" friends={outgoing} empty="You have no outgoing requests." />
    </div>
  );
}
