import type { Metadata } from "next";
import Link from "next/link";
import { EmoteText } from "@/components/chat/EmoteText";
import { EmptyState } from "@/components/hearth/EmptyState";
import { PresenceLabel } from "@/components/hearth/PresenceLabel";
import { Avatar, Window } from "@/components/ui";
import { requireViewer } from "@/lib/auth/guards";
import { formatStamp } from "@/lib/format";
import { getCurrentUser } from "@/lib/queries";
import { getDmInbox } from "@/lib/queries-chat";

export const metadata: Metadata = { title: "Messages | PairADice" };

export default async function MessagesPage() {
  const viewer = await requireViewer("/messages");
  const [threads, user] = await Promise.all([getDmInbox(viewer), getCurrentUser()]);
  const tz = user?.timezone ?? "UTC";
  return (
    <div className="flex flex-col gap-10">
      <header>
        <h1 className="font-display text-3xl font-bold [text-shadow:0_2px_0_var(--color-ink)]">Messages</h1>
        <p className="text-lavender">Whispers with friends and teammates, newest first.</p>
      </header>
      <Window title="Conversations" landmark>
        {threads.length === 0 ? (
          <EmptyState title="No whispers yet" sprite="icon-chat">
            Start one from a friend&apos;s row on the Friends page, or from a teammate&apos;s character sheet.
          </EmptyState>
        ) : (
          <ul role="list" className="flex flex-col gap-2">
            {threads.map((t) => (
              <li key={t.other_id}>
                <Link
                  href={`/messages/${t.other_id}`}
                  className="flex min-h-14 items-start gap-3 rounded-frame bg-ink/30 p-3 transition duration-150 hover:bg-ink/50"
                >
                  <Avatar userId={t.other_id} size={32} status={t.other_presence} statusText={false} />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-display text-base font-semibold [overflow-wrap:anywhere]">{t.other_display_name}</span>
                      <span className="text-sm text-lavender">{formatStamp(t.sent_at, tz)}</span>
                    </span>
                    <PresenceLabel presence={t.other_presence} className="text-lavender" />
                    <span className="mt-1 block truncate text-cream/90">
                      {t.is_deleted || t.content === null ? (
                        <em className="text-lavender">message removed</em>
                      ) : (
                        <>
                          {t.sent_by_me ? <span className="text-lavender">You: </span> : null}
                          <EmoteText text={t.content} />
                        </>
                      )}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Window>
    </div>
  );
}
