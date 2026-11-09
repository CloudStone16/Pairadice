import { ChatRoom, type RoomComposer, type RoomLine } from "@/components/chat/ChatRoom";
import { Window } from "@/components/ui";
import type { ChatMessage, SessionStatus } from "@/lib/types";
import { LockedNote } from "./LockedNote";

/** Session chat as RPG dialogue boxes with a live composer. `messages` is null when the viewer is not in the party. */
export function DialogueLog({
  messages,
  sessionId,
  viewerId,
  hostId,
  status,
  timeZone,
  composer,
}: {
  messages: ChatMessage[] | null;
  sessionId: number;
  viewerId: number;
  hostId: number;
  status: SessionStatus;
  timeZone: string;
  composer: RoomComposer;
}) {
  if (messages === null) {
    return (
      <Window title="Campfire chat" landmark>
        <LockedNote status={status} />
      </Window>
    );
  }

  const lines: RoomLine[] = messages.map((m) => ({
    messageId: m.message_id,
    senderId: m.sender_id,
    name: m.display_name || m.username,
    content: m.content,
    isDeleted: m.is_deleted,
    sentAt: `${m.sent_at.replace(" ", "T").replace(/Z$/, "")}Z`,
    edited: m.edited_at !== null,
  }));

  return (
    <Window title="Campfire chat" landmark>
      <ChatRoom
        kind="session"
        targetId={sessionId}
        sessionIdForReport={sessionId}
        viewerId={viewerId}
        hostId={hostId}
        initial={lines}
        names={{}}
        composer={composer}
        timeZone={timeZone}
        back={`/camp/${sessionId}`}
        emptyTitle="The camp is quiet"
        emptyText="Nobody has spoken yet. Once the party starts talking, their words will appear here."
      />
    </Window>
  );
}
