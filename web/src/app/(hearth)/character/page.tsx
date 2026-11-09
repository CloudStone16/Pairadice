import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CharacterSheet } from "@/components/hearth/CharacterSheet";
import { MyReports } from "@/components/report/MyReports";
import { SignInGate } from "@/components/hearth/SignInGate";
import { getViewer } from "@/lib/auth/viewer";
import { getMyReports } from "@/lib/mutations/report";
import {
  getCurrentUser,
  getPlayerBadges,
  getPlayerCard,
  getPlayerGames,
  getPlayerLanguages,
} from "@/lib/queries";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const user = await getCurrentUser();
    if (user) return { title: `${user.display_name} | PairADice` };
  } catch {
    // fall back to the generic title
  }
  return { title: "Character | PairADice" };
}

export default async function MyCharacterPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInGate />;
  const [card, games, languages, badges] = await Promise.all([
    getPlayerCard(user.user_id),
    getPlayerGames(user.user_id),
    getPlayerLanguages(user.user_id),
    getPlayerBadges(user.user_id),
  ]);
  if (!card) notFound();
  const viewer = await getViewer();
  const mine = viewer ? await getMyReports(viewer) : null;
  return (
    <div className="flex flex-col gap-8">
      <CharacterSheet card={card} presence={user.presence} isSelf games={games} languages={languages} badges={badges} />
      {mine && (!mine.ok || mine.value.length > 0) ? (
        <MyReports
          reports={mine.ok ? mine.value : []}
          timeZone={user.timezone}
          error={mine.ok ? undefined : mine.message}
        />
      ) : null}
    </div>
  );
}
