import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CharacterSheet } from "@/components/hearth/CharacterSheet";
import { SignInGate } from "@/components/hearth/SignInGate";
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
  return (
    <CharacterSheet card={card} presence={user.presence} isSelf games={games} languages={languages} badges={badges} />
  );
}
