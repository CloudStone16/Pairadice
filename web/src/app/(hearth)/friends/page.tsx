import type { Metadata } from "next";
import { FriendList } from "@/components/hearth/FriendList";
import { SignInGate } from "@/components/hearth/SignInGate";
import { getCurrentUser, getFriendLists } from "@/lib/queries";

export const metadata: Metadata = { title: "Friends | PairADice" };

export default async function FriendsPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInGate />;
  const { accepted, incoming, outgoing } = await getFriendLists(user.user_id);
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
