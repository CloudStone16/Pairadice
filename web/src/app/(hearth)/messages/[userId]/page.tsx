import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChatRoom, type RoomLine } from "@/components/chat/ChatRoom";
import { composerState } from "@/components/chat/composer-state";
import { PresenceLabel } from "@/components/hearth/PresenceLabel";
import { Avatar, Window } from "@/components/ui";
import { requireViewer } from "@/lib/auth/guards";
import { parseId } from "@/lib/chat/validate";
import { getCurrentUser, getUserById } from "@/lib/queries";
import { fetchDmLines, getCanMessage, getChatStatus, isRefusal } from "@/lib/queries-chat";

type Params = { userId: string };

export const metadata: Metadata = { title: "Messages | PairADice" };

export default async function ThreadPage({ params }: { params: Promise<Params> }) {
  const { userId } = await params;
  const id = parseId(userId);
  if (id === null) notFound();
  const viewer = await requireViewer(`/messages/${id}`);
  if (id === viewer.userId) notFound();
  const [other, me, can, status, lines] = await Promise.all([
    getUserById(id),
    getCurrentUser(),
    getCanMessage(viewer, id),
    getChatStatus(viewer),
    fetchDmLines(viewer, id, null).catch((err: unknown) => {
      if (isRefusal(err)) return [];
      throw err;
    }),
  ]);
  // blocked, banned or otherwise unreachable with no history: the page does not exist for this viewer
  if (!other || !me || (!can.can && lines.length === 0)) notFound();
  const names = { [viewer.userId]: me.display_name, [id]: other.display_name };
  const initial: RoomLine[] = lines.map((l) => ({
    messageId: l.messageId,
    senderId: l.senderId,
    name: names[l.senderId] ?? "Player",
    content: l.content,
    isDeleted: l.isDeleted,
    sentAt: l.sentAt,
    edited: false,
  }));
  const composer = can.can
    ? composerState(viewer.status, status, me.timezone)
    : { mode: "note" as const, text: can.reason ?? "You cannot message this player." };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-center gap-4">
        <Avatar userId={id} size={64} status={can.can ? other.presence : undefined} />
        <div className="min-w-0 flex-1 leading-tight">
          <h1 className="font-display text-3xl font-bold [overflow-wrap:anywhere] [text-shadow:0_2px_0_var(--color-ink)]">
            {other.display_name}
          </h1>
          <p className="text-lavender">@{other.username}</p>
          {can.can ? <PresenceLabel presence={other.presence} className="mt-1" /> : null}
        </div>
        <Link
          href="/messages"
          className="inline-flex min-h-11 items-center rounded-pill px-3 font-semibold text-lavender underline underline-offset-2 hover:bg-plum-2 hover:text-cream"
        >
          All messages
        </Link>
      </header>
      <Window title={`Whispers with ${other.display_name}`} landmark>
        <ChatRoom
          kind="dm"
          targetId={id}
          viewerId={viewer.userId}
          initial={initial}
          names={names}
          composer={composer}
          timeZone={me.timezone}
          back={`/messages/${id}`}
          emptyTitle="Nothing said yet"
          emptyText={can.can ? "Say hello. Your first line starts the conversation." : "There are no messages here."}
        />
      </Window>
    </div>
  );
}
