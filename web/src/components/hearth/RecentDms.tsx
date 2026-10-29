import { Avatar, Window } from "@/components/ui";
import { formatStamp } from "@/lib/format";
import type { DmThread } from "@/lib/types";
import { EmptyState } from "./EmptyState";
import { UserLink } from "./UserLink";

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
                  <UserLink userId={t.other_id} className="truncate">
                    {t.other_display_name}
                  </UserLink>
                  <span className="shrink-0 text-sm text-lavender">{formatStamp(t.sent_at, timeZone)}</span>
                </div>
                {t.is_deleted || t.content === null ? (
                  <p className="text-sm italic text-lavender">message removed</p>
                ) : (
                  <p className="truncate text-sm text-cream/90">
                    {t.sent_by_me ? <span className="text-lavender">You: </span> : null}
                    {t.content}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Window>
  );
}
