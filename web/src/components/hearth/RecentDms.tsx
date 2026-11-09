import Link from "next/link";
import { EmoteText } from "@/components/chat/EmoteText";
import { Avatar, Window } from "@/components/ui";
import { formatStamp } from "@/lib/format";
import type { DmThread } from "@/lib/types";
import { EmptyState } from "./EmptyState";

export function RecentDms({ threads, timeZone }: { threads: DmThread[]; timeZone: string }) {
  return (
    <Window title="Recent DMs">
      {threads.length === 0 ? (
        <EmptyState title="No whispers yet" sprite="icon-chat">
          Direct messages with friends will show up here.
        </EmptyState>
      ) : (
        <ul role="list" className="divide-y divide-lavender/15">
          {threads.map((t) => (
            <li key={t.other_id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <Avatar userId={t.other_id} size={32} status={t.other_presence} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <Link
                    href={`/messages/${t.other_id}`}
                    className="inline-flex min-h-6 max-w-full items-center truncate rounded-sm font-semibold text-cream underline decoration-ember/60 underline-offset-4 hover:text-ember"
                  >
                    {t.other_display_name}
                  </Link>
                  <span className="shrink-0 text-sm text-lavender">{formatStamp(t.sent_at, timeZone)}</span>
                </div>
                {t.is_deleted || t.content === null ? (
                  <p className="text-sm italic text-lavender">message removed</p>
                ) : (
                  <p className="truncate text-sm text-cream/90">
                    {t.sent_by_me ? <span className="text-lavender">You: </span> : null}
                    <EmoteText text={t.content} />
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 border-t border-lavender/15 pt-3">
        <Link
          href="/messages"
          className="inline-flex min-h-9 items-center rounded-sm font-semibold text-cream underline decoration-ember/60 underline-offset-4 hover:text-ember"
        >
          All messages
        </Link>
      </p>
    </Window>
  );
}
