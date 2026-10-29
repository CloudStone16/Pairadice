import { Avatar, Button, Chip, Window } from "@/components/ui";
import { formatStamp } from "@/lib/format";
import type { ChatMessage, SessionStatus } from "@/lib/types";
import { EmptyState } from "./EmptyState";
import { LockedNote } from "./LockedNote";
import { UserLink } from "./UserLink";

/** Read-only session chat rendered as RPG dialogue boxes. `messages` is null when the viewer is not in the party. */
export function DialogueLog({
  messages,
  hostId,
  status,
  timeZone,
}: {
  messages: ChatMessage[] | null;
  hostId: number;
  status: SessionStatus;
  timeZone: string;
}) {
  if (messages === null) {
    return (
      <Window title="Campfire chat" landmark>
        <LockedNote status={status} />
      </Window>
    );
  }

  return (
    <Window title="Campfire chat" landmark>
      {messages.length === 0 ? (
        <EmptyState title="The camp is quiet" sprite="deco-moon">
          Nobody has spoken yet. Once the party starts talking, their words will appear here.
        </EmptyState>
      ) : (
        <ol role="list" className="space-y-5">
          {messages.map((m) => (
            <li key={m.message_id} className="flex items-start gap-3">
              <Avatar userId={m.sender_id} size={64} />
              <div className="min-w-0 flex-1 rounded-window bg-ink/60 px-4 py-3 ring-2 ring-inset ring-lavender/40">
                <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="rounded-chip border-2 border-ink bg-plum-2 px-2.5 py-0.5 font-display text-sm font-semibold">
                    <UserLink userId={m.sender_id}>{m.username}</UserLink>
                  </span>
                  {m.sender_id === hostId ? <Chip tone="ember">Host</Chip> : null}
                  <time
                    dateTime={`${m.sent_at.replace(" ", "T")}Z`}
                    className="ml-auto text-sm text-lavender"
                  >
                    {formatStamp(m.sent_at, timeZone)}
                  </time>
                </div>
                {m.is_deleted || m.content === null ? (
                  <p className="italic text-lavender">message removed by moderation</p>
                ) : (
                  <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
                    {m.content}
                    {m.edited_at ? <span className="ml-2 text-sm text-lavender">(edited)</span> : null}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <form className="mt-6 border-t border-lavender/20 pt-4" aria-label="Chat composer">
        <div className="flex items-center gap-3">
          <label htmlFor="chat-composer" className="sr-only">
            Message
          </label>
          <input
            id="chat-composer"
            disabled
            aria-describedby="chat-composer-help"
            placeholder="Say something"
            className="min-h-11 flex-1 cursor-not-allowed rounded-pill bg-ink/50 px-4 text-cream placeholder:text-lavender disabled:opacity-70"
          />
          <Button variant="yellow" size="sm" disabled>
            Send
          </Button>
        </div>
        <p id="chat-composer-help" className="mt-2 text-sm text-lavender">
          The fire&apos;s quiet for now &mdash; chat is coming soon.
        </p>
      </form>
    </Window>
  );
}
