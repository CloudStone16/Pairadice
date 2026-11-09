import { Avatar, Chip, Sprite, Window } from "@/components/ui";
import type { ReactNode } from "react";
import { cartSprite, formatWhen } from "@/lib/format";
import type { Camp } from "@/lib/types";
import { StatusChip } from "./StatusChip";
import { UserLink } from "./UserLink";

/** How the viewer relates to the camp. */
export type ViewerRole = "host" | "member" | "knocking" | "none";

function CampAction({ camp, role, actions }: { camp: Camp; role: ViewerRole; actions?: ReactNode }) {
  if (role === "none") return camp.status === "open" ? (actions ?? null) : null;
  const chip =
    role === "host" ? (
      <Chip tone="ember" icon={<Sprite name="icon-crown" />}>You&apos;re hosting</Chip>
    ) : role === "member" ? (
      <Chip tone="green" icon={<Sprite name="icon-party" />}>You&apos;re in the party</Chip>
    ) : (
      <Chip tone="lavender" icon={<Sprite name="icon-knock" />}>You&apos;re knocking at the door</Chip>
    );
  return (
    <div className="flex flex-col items-start gap-3">
      {chip}
      {actions}
    </div>
  );
}

export function CampBanner({
  camp,
  role,
  timeZone,
  actions,
}: {
  camp: Camp;
  role: ViewerRole;
  timeZone: string;
  /** Interactive controls for the viewer (the camp page passes <CampActions />). */
  actions?: ReactNode;
}) {
  const when = formatWhen(camp.scheduled_start, timeZone);
  return (
    <Window variant="parchment">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="shrink-0 self-start rounded-window bg-wood-dark p-2 ring-2 ring-ink">
          {/* the game and mode are spelled out next to it, so the cartridge is decorative */}
          <Sprite name={cartSprite(camp.game_slug)} scale={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={camp.status} />
            <p className="min-w-0 text-sm font-semibold text-wood-dark [overflow-wrap:anywhere]">
              {camp.game} &middot; {camp.game_mode}
            </p>
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold leading-tight [overflow-wrap:anywhere]">
            {camp.title}
          </h1>
          {camp.description ? (
            <p className="mt-2 text-wood-dark [overflow-wrap:anywhere]">{camp.description}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <span className="inline-flex items-center gap-2">
              <Avatar userId={camp.host_id} size={32} />
              <span>
                Hosted by{" "}
                <UserLink userId={camp.host_id} tone="light" inline>
                  {camp.host_username}
                </UserLink>
              </span>
            </span>
            <Chip tone="lavender" icon={<Sprite name="icon-clock" />}>
              {when ?? "No start time set"}
            </Chip>
          </div>
          <div className="mt-4 empty:hidden">
            <CampAction camp={camp} role={role} actions={actions} />
          </div>
        </div>
      </div>
    </Window>
  );
}
