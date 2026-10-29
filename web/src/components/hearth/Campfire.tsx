import { Avatar, Sprite, Window } from "@/components/ui";
import type { FriendEntry, Quest } from "@/lib/types";
import { CampfireFlame } from "./CampfireFlame";
import { PresenceLabel } from "./PresenceLabel";
import { QuickPicks } from "./QuickPicks";
import { UserLink } from "./UserLink";

/** Friends seated around the fire at most. */
const SEATS = 6;

/** A little wooden picture frame for the avatars sitting around the fire. */
function Portrait({ friend }: { friend: FriendEntry }) {
  return (
    <span className="inline-flex rounded-frame bg-plank-fine p-1 shadow-[0_3px_0_rgb(18_14_31/0.6)] ring-2 ring-ink">
      <Avatar userId={friend.user_id} size={32} status={friend.presence} alt={friend.display_name} />
    </span>
  );
}

/** An unoccupied log, so the two sides of the fire always hold the same number of seats. */
function EmptyLog() {
  return (
    <span aria-hidden="true" className="inline-flex h-12 w-12 items-center justify-center rounded-frame bg-ink/30">
      <Sprite name="icon-seat" className="opacity-40" />
    </span>
  );
}

function Side({ friends, pad, align }: { friends: FriendEntry[]; pad: number; align: "end" | "start" }) {
  return (
    <div className={`flex flex-col gap-2 ${align === "end" ? "items-end" : "items-start"}`}>
      {friends.map((f) => (
        <Portrait key={f.user_id} friend={f} />
      ))}
      {Array.from({ length: pad }, (_, i) => (
        <EmptyLog key={`log-${i}`} />
      ))}
    </div>
  );
}

function FriendRows({ friends }: { friends: FriendEntry[] }) {
  return (
    <ul role="list" className="space-y-2">
      {friends.map((f) => (
        <li key={f.user_id} className="flex items-center gap-3">
          <Avatar userId={f.user_id} size={32} />
          <div className="min-w-0 flex-1 leading-tight">
            <UserLink userId={f.user_id} className="text-sm [overflow-wrap:anywhere]">
              {f.display_name}
            </UserLink>
            <div>
              <PresenceLabel presence={f.presence} className="text-lavender" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

const headingClass = "mb-2 mt-5 font-display text-sm font-semibold uppercase tracking-wider text-lavender";

/**
 * Right-hand panel: animated fire with the friends who are actually online sitting around it,
 * everyone else listed below as away, and (off the Hearth) a few quick recommendations.
 */
export function Campfire({ friends, recommended }: { friends: FriendEntry[]; recommended: Quest[] }) {
  const online = friends.filter((f) => f.presence === "online");
  const away = friends.filter((f) => f.presence !== "online");
  const seated = online.slice(0, SEATS);
  const perSide = Math.max(1, Math.ceil(seated.length / 2));
  const left = seated.filter((_, i) => i % 2 === 0);
  const right = seated.filter((_, i) => i % 2 === 1);

  return (
    <div className="flex flex-col gap-8">
      <Window title="Campfire" glow contentClassName="relative isolate overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-4 -z-10 h-60 bg-[radial-gradient(ellipse_at_50%_55%,rgb(242_166_90/0.22),transparent_68%)]"
        />
        <div className="relative flex items-end justify-center gap-3 pt-2">
          <Side friends={left} pad={perSide - left.length} align="end" />
          <CampfireFlame />
          <Side friends={right} pad={perSide - right.length} align="start" />
        </div>

        {friends.length === 0 ? (
          <>
            <h3 className={headingClass}>Your friends</h3>
            <p className="text-sm text-lavender">
              No one by the fire yet. Friends you make will pull up a log here.
            </p>
          </>
        ) : online.length === 0 ? (
          <>
            <h3 className={headingClass}>Your friends</h3>
            <p className="mb-3 text-sm text-lavender">The fire&apos;s quiet tonight.</p>
            <FriendRows friends={away} />
          </>
        ) : (
          <>
            <h3 className={headingClass}>Gathered here</h3>
            <FriendRows friends={online} />
            {away.length > 0 ? (
              <>
                <h3 className={headingClass}>Away from the fire</h3>
                <FriendRows friends={away} />
              </>
            ) : null}
          </>
        )}
      </Window>

      <QuickPicks recommended={recommended} />
    </div>
  );
}
