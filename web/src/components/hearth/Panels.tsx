import { getFriendLists, getGames, getModes, getRecommendedQuests } from "@/lib/queries";
import { Campfire } from "./Campfire";
import { GameShelf } from "./GameShelf";

// Async server components. The hearth layout wraps each in <Suspense> so the
// page shell and the main content stream in without waiting on these queries.

export async function ShelfPanel({ userId }: { userId: number }) {
  const [games, modes] = await Promise.all([getGames(userId), getModes()]);
  return <GameShelf games={games} modes={modes} />;
}

export async function CampfirePanel({ userId }: { userId: number }) {
  const [friends, recommended] = await Promise.all([getFriendLists(userId), getRecommendedQuests(userId)]);
  return <Campfire friends={friends.accepted} recommended={recommended.slice(0, 3)} />;
}
