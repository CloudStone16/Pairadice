import { formatStamp } from "@/lib/format";
import type { ChatStatus } from "@/lib/queries-chat";
import type { RoomComposer } from "./ChatRoom";

/** Decide what replaces the composer: suspended (read-only), muted (until a local time), or ready. */
export function composerState(viewerStatus: string, chat: ChatStatus, timeZone: string): RoomComposer {
  if (viewerStatus !== "active" || chat.accountStatus !== "active") {
    return { mode: "note", text: "Your account is suspended, so chat is read-only until a moderator lifts it." };
  }
  if (chat.mutedUntil) {
    return { mode: "note", text: `You are muted until ${formatStamp(chat.mutedUntil, timeZone)}. You can still read the chat.` };
  }
  return { mode: "ready" };
}
