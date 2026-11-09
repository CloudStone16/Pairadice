import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CharacterSheet } from "@/components/hearth/CharacterSheet";
import { SignInGate } from "@/components/hearth/SignInGate";
import { MessageLink } from "@/components/chat/MessageLink";
import { getCanMessage } from "@/lib/queries-chat";
import { ReportLink } from "@/components/report/ReportLink";
import { ReportedNotice, isReported } from "@/components/report/ReportedNotice";
import { RelationshipBar } from "@/components/social/RelationshipBar";
import { getViewer } from "@/lib/auth/viewer";
import { getRelation } from "@/lib/queries-social";
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

export default async function CharacterPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ reported?: string | string[] }>;
}) {
  const { userId } = await params;
  const { reported } = await searchParams;
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

  let relationship = null;
  const viewer = me.user_id === id ? null : await getViewer();
  if (viewer) {
    const [rel, canMsg] = await Promise.all([getRelation(viewer, id), getCanMessage(viewer, id)]);
    relationship = (
      <>
        <RelationshipBar
          userId={id}
          name={card.display_name}
          relation={rel.ok ? rel.value : "none"}
          error={rel.ok ? undefined : rel.message}
        />
        {canMsg.can ? <MessageLink userId={id} name={card.display_name} /> : null}
        <ReportLink userId={id} name={card.display_name} back={`/character/${id}`} />
        <ReportedNotice show={isReported(reported)} />
      </>
    );
  }
  return (
    <CharacterSheet
      card={card}
      presence={user?.presence ?? "away"}
      isSelf={me.user_id === id}
      games={games}
      languages={languages}
      badges={badges}
      relationship={relationship}
    />
  );
}
