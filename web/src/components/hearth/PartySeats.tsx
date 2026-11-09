import type { ReactNode } from "react";
import {
  acceptPlayerAction,
  declinePlayerAction,
  kickPlayerAction,
} from "@/app/(hearth)/camp/[sessionId]/actions";
import { ActionControl } from "@/components/camp/ActionControl";
import { SeatPortrait } from "@/components/camp/SeatPortrait";
import { Avatar, Chip, Sprite, Window } from "@/components/ui";
import { formatStamp } from "@/lib/format";
import type { Camp, RosterEntry } from "@/lib/types";
import { LockedNote } from "./LockedNote";
import { UserLink } from "./UserLink";

function Seat({ children, tone = "filled" }: { children: ReactNode; tone?: "filled" | "knock" | "empty" }) {
  const styles = {
    filled: "bg-plum-2 ring-lavender/40",
    knock: "bg-plum-2/60 ring-ember/30",
    empty: "bg-ink/30 ring-lavender/30",
  }[tone];
  return (
    <li
      className={`flex min-h-24 items-center min-w-0 gap-3 rounded-frame p-3 ring-2 ring-inset ${styles} ${
        tone === "knock" ? "border-2 border-dashed border-ember/60" : ""
      }`}
    >
      {children}
    </li>
  );
}

function SeatedPlayer({
  p,
  sessionId,
  isHost,
  isMe,
  canKick,
}: {
  p: RosterEntry;
  sessionId: number;
  isHost: boolean;
  isMe: boolean;
  canKick: boolean;
}) {
  return (
    <Seat>
      <SeatPortrait sessionId={sessionId} userId={p.user_id} state="accepted" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <UserLink userId={p.user_id} className="[overflow-wrap:anywhere]">
            {p.username}
          </UserLink>
          {isHost ? (
            <Chip tone="ember" icon={<Sprite name="icon-crown" />}>
              Host
            </Chip>
          ) : null}
          {isMe ? <Chip tone="lavender">You</Chip> : null}
        </div>
        {p.game_role ? <p className="text-sm text-lavender">{p.game_role}</p> : null}
        {p.gamertag ? (
          <p className="mt-0.5 text-sm [overflow-wrap:anywhere]">
            <span className="font-semibold">{p.gamertag}</span>
            {p.identity_label ? (
              <span className="ml-1.5 text-sm text-lavender">{p.identity_label}</span>
            ) : null}
          </p>
        ) : null}
        {canKick ? (
          <div className="mt-2">
            <ActionControl
              action={kickPlayerAction}
              fields={{ sessionId, userId: p.user_id }}
              label="Kick"
              accessibleName={`Kick ${p.username}`}
              icon="icon-kick"
              variant="red"
              size="sm"
              confirm={{ prompt: `Remove ${p.username} from the party?`, yes: "Yes, remove", no: "Keep" }}
            />
          </div>
        ) : null}
      </div>
    </Seat>
  );
}

export function PartySeats({
  camp,
  roster,
  viewerId,
  canSeePrivate,
  canManage,
  timeZone,
}: {
  camp: Camp;
  roster: RosterEntry[];
  viewerId: number;
  /** Host or accepted participant: gamertags are visible. */
  canSeePrivate: boolean;
  /** Host or moderator: may accept, decline and kick. */
  canManage: boolean;
  timeZone: string;
}) {
  const accepted = roster.filter((r) => r.status === "accepted");
  const knocking = roster.filter((r) => r.status === "requested");
  const former = roster.filter((r) => r.status !== "accepted" && r.status !== "requested");
  const openSeats = Math.max(0, camp.max_players - accepted.length);
  const emptyCount = Math.max(0, openSeats - knocking.length);
  const closed = camp.status === "completed" || camp.status === "cancelled";
  const live = !closed;

  return (
    <Window title="Party seats" landmark>
      <p className="mb-4 text-sm text-lavender">
        {accepted.length} of {camp.max_players} seats filled
        {knocking.length > 0 ? ` · ${knocking.length} knocking at the door` : ""}
      </p>
      {canSeePrivate ? null : <LockedNote status={camp.status} className="mb-4" />}
      <ul role="list" className="grid gap-3 sm:grid-cols-2">
        {accepted.map((p) => (
          <SeatedPlayer
            key={p.user_id}
            p={p}
            sessionId={camp.session_id}
            isHost={p.user_id === camp.host_id}
            isMe={p.user_id === viewerId}
            canKick={canManage && live && p.user_id !== camp.host_id}
          />
        ))}
        {knocking.map((p) => (
          <Seat key={p.user_id} tone="knock">
            <span className="relative">
              <SeatPortrait sessionId={camp.session_id} userId={p.user_id} state="knocking" />
              <Sprite name="icon-knock" className="absolute -right-2 -top-2" />
            </span>
            <div className="min-w-0 flex-1">
              <UserLink userId={p.user_id} className="[overflow-wrap:anywhere]">
                {p.username}
              </UserLink>
              <p className="text-sm text-ember">Knocking at the door{p.game_role ? ` · ${p.game_role}` : ""}</p>
              {p.user_id === viewerId ? <Chip tone="lavender">You</Chip> : null}
              {canManage && camp.status === "open" ? (
                <div className="mt-2 flex flex-wrap items-start gap-2">
                  <ActionControl
                    action={acceptPlayerAction}
                    fields={{ sessionId: camp.session_id, userId: p.user_id }}
                    label="Accept"
                    accessibleName={`Accept ${p.username}`}
                    icon="icon-accept"
                    variant="green"
                    size="sm"
                  />
                  <ActionControl
                    action={declinePlayerAction}
                    fields={{ sessionId: camp.session_id, userId: p.user_id }}
                    label="Decline"
                    accessibleName={`Decline ${p.username}`}
                    icon="icon-decline"
                    variant="ghost"
                    size="sm"
                  />
                </div>
              ) : null}
            </div>
          </Seat>
        ))}
        {Array.from({ length: emptyCount }, (_, i) => (
          <Seat key={`empty-${i}`} tone="empty">
            <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-ink/40">
              <Sprite name="icon-seat" scale={2} className="opacity-70" />
            </span>
            <p className="text-sm text-lavender">{closed ? "Empty seat" : "Open seat"}</p>
          </Seat>
        ))}
      </ul>

      {former.length > 0 ? (
        <details className="group mt-5 rounded-frame bg-ink/30 px-4 py-2">
          <summary className="cursor-pointer select-none rounded-sm py-1 font-display text-sm font-semibold text-lavender marker:text-ember">
            Previously in party ({former.length})
          </summary>
          <ul role="list" className="mt-2 space-y-2 pb-2">
            {former.map((p) => (
              <li key={p.user_id} className="flex items-center gap-3 text-sm">
                <Avatar userId={p.user_id} size={32} />
                <UserLink userId={p.user_id} className="[overflow-wrap:anywhere]">
                  {p.username}
                </UserLink>
                <span className="text-lavender">
                  {p.status}
                  {p.left_at ? ` · ${formatStamp(p.left_at, timeZone)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Window>
  );
}
