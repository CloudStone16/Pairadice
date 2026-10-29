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
  getUserById,
} from "@/lib/queries";

type Params = { userId: string };

function parseId(userId: string): number | null {
  if (!/^\d{1,15}$/.test(userId)) return null;
  const id = Number(userId);
  return Number.isSafeInteger(id) ? id : null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { userId } = await params;
  const id = parseId(userId);
  if (id === null) notFound();
  let card = null;
  try {
    const user = await getCurrentUser();
    if (!user) return { title: "Character | PairADice" };
    card = await getPlayerCard(id);
  } catch {
    // the page itself reports the real error; use the generic title meanwhile
    return { title: "Character | PairADice" };
  }
  if (!card) notFound();
  return { title: `${card.display_name} | PairADice` };
}

export default async function CharacterPage({ params }: { params: Promise<Params> }) {
  const { userId } = await params;
  const id = parseId(userId);
  if (id === null) notFound();

  const me = await getCurrentUser();
  if (!me) return <SignInGate />;

  const [card, user, games, languages, badges] = await Promise.all([
    getPlayerCard(id),
    getUserById(id),
    getPlayerGames(id),
    getPlayerLanguages(id),
    getPlayerBadges(id),
  ]);
  if (!card) notFound();
  return (
    <CharacterSheet
      card={card}
      presence={user?.presence ?? "away"}
      isSelf={me.user_id === id}
      games={games}
      languages={languages}
      badges={badges}
    />
  );
}
