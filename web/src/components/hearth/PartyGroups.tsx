import Link from "next/link";
import { Sprite, Window } from "@/components/ui";
import { cartSprite, formatWhen } from "@/lib/format";
import type { PartyEntry, PartyRole } from "@/lib/types";
import { EmptyState } from "./EmptyState";
import { StatusChip } from "./StatusChip";

const GROUPS: Array<{ role: PartyRole; title: string; empty: string }> = [
  { role: "hosting", title: "Hosting", empty: "You are not hosting any quests." },
  { role: "party", title: "In party", empty: "You have not joined a party yet." },
  { role: "knocking", title: "Knocking", empty: "No pending requests. Knock on a camp from the board." },
];

function PartyRow({ entry, timeZone }: { entry: PartyEntry; timeZone: string }) {
  const when = formatWhen(entry.scheduled_start, timeZone);
  return (
    <li>
      <Link
        href={`/camp/${entry.session_id}`}
        className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-frame bg-ink/30 p-3 transition duration-150 motion-safe:hover:-translate-y-0.5 hover:bg-ink/50 hover:shadow-[0_0_18px_rgb(242_166_90/0.25)]"
      >
        <Sprite name={cartSprite(entry.game_slug)} />
        <span className="min-w-0 flex-1 basis-48 leading-tight">
          <span className="block font-display text-base font-semibold [overflow-wrap:anywhere]">{entry.title}</span>
          <span className="block text-sm text-lavender [overflow-wrap:anywhere]">
            {entry.game} &middot; {entry.game_mode} &middot; {when ?? "No start time"}
          </span>
        </span>
        <span className="text-sm tabular-nums text-lavender">
          {entry.current_players}/{entry.max_players} seats
        </span>
        <StatusChip status={entry.status} />
      </Link>
    </li>
  );
}

export function PartyGroups({ entries, timeZone }: { entries: PartyEntry[]; timeZone: string }) {
  if (entries.length === 0) {
    return (
      <EmptyState as="h2" title="Your party is empty" sprite="icon-party">
        Host a quest or knock on a camp from the Quest Board and it will show up here.
      </EmptyState>
    );
  }
  return (
    <div className="flex flex-col gap-10">
      {GROUPS.map((g) => {
        const items = entries.filter((e) => e.role === g.role);
        return (
          <Window key={g.role} title={`${g.title} (${items.length})`}>
            {items.length === 0 ? (
              <p className="text-sm text-lavender">{g.empty}</p>
            ) : (
              <ul role="list" className="space-y-3">
                {items.map((e) => (
                  <PartyRow key={e.session_id} entry={e} timeZone={timeZone} />
                ))}
              </ul>
            )}
          </Window>
        );
      })}
    </div>
  );
}
