import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CharacterSheet } from "@/components/hearth/CharacterSheet";
import { dbRoleFor, getViewer, requireViewerUser } from "@/lib/auth/guards";
import {
  getPlayerBadges,
  getPlayerCard,
  getPlayerGames,
  getPlayerLanguages,
} from "@/lib/queries";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const session = await getViewer();
    if (session) return { title: `${session.displayName} | PairADice` };
  } catch {
    // fall back to the generic title
  }
  return { title: "Character | PairADice" };
}

export default async function MyCharacterPage() {
  const { session, user } = await requireViewerUser("/character");
  const [card, games, languages, badges] = await Promise.all([
    getPlayerCard(user.user_id, user.user_id, dbRoleFor(session)),
    getPlayerGames(user.user_id),
    getPlayerLanguages(user.user_id),
    getPlayerBadges(user.user_id),
  ]);
  if (!card) notFound();
  return (
    <CharacterSheet card={card} presence={session.status === "suspended" ? "suspended" : user.presence} isSelf games={games} languages={languages} badges={badges} />
  );
}
