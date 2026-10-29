import Link from "next/link";
import { Avatar, Window } from "@/components/ui";
import type { FriendEntry } from "@/lib/types";
import { PresenceLabel } from "./PresenceLabel";

export function FriendList({
  title,
  friends,
  empty,
}: {
  title: string;
  friends: FriendEntry[];
  empty: string;
}) {
  return (
    <Window title={`${title} (${friends.length})`}>
      {friends.length === 0 ? (
        <p className="text-sm text-lavender">{empty}</p>
      ) : (
        <ul role="list" className="grid gap-3 sm:grid-cols-2">
          {friends.map((f) => (
            <li key={f.user_id}>
              <Link
                href={`/character/${f.user_id}`}
                className="flex items-center gap-3 rounded-frame bg-ink/30 p-3 transition duration-150 motion-safe:hover:-translate-y-0.5 hover:bg-ink/50 hover:shadow-[0_0_18px_rgb(242_166_90/0.25)]"
              >
                <Avatar userId={f.user_id} size={64} status={f.presence} />
                <span className="min-w-0 leading-tight">
                  <span className="block font-display text-base font-semibold [overflow-wrap:anywhere]">{f.display_name}</span>
                  <span className="block text-sm text-lavender [overflow-wrap:anywhere]">@{f.username}</span>
                  <PresenceLabel presence={f.presence} className="mt-1" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Window>
  );
}
