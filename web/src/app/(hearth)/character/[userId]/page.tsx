import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CharacterSheet } from "@/components/hearth/CharacterSheet";
import { dbRoleFor, getViewer } from "@/lib/auth/guards";
import {
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
    const me = await getViewer();
    card = await getPlayerCard(id, me?.userId ?? null, dbRoleFor(me));
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

  const me = await getViewer();

  // The card enforces bans and blocks; nothing else about the user is fetched when it is hidden.
  const card = await getPlayerCard(id, me?.userId ?? null, dbRoleFor(me));
  if (!card) notFound();
  const [user, games, languages, badges] = await Promise.all([
    getUserById(id, dbRoleFor(me)),
    getPlayerGames(id),
    getPlayerLanguages(id),
    getPlayerBadges(id),
  ]);
  return (
    <CharacterSheet
      card={card}
      presence={user?.presence ?? "away"}
      isSelf={me?.userId === id}
      games={games}
      languages={languages}
      badges={badges}
    />
  );
}
