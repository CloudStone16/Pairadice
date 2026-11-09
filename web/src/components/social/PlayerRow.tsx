import type { ReactNode } from "react";
import { Avatar } from "@/components/ui";
import { UserLink } from "@/components/hearth/UserLink";

/** A player in a social list: avatar, linked name, @username, and the actions for this row. */
export function PlayerRow({
  userId,
  displayName,
  username,
  note,
  children,
}: {
  userId: number;
  displayName: string;
  username: string;
  /** Plain-text status, e.g. "Suspended". */
  note?: string;
  children?: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-frame bg-ink/30 p-3">
      <Avatar userId={userId} size={32} />
      <div className="min-w-0 flex-1 leading-tight">
        <UserLink userId={userId} className="font-display text-base [overflow-wrap:anywhere]">
          {displayName}
        </UserLink>
        <p className="text-sm text-lavender [overflow-wrap:anywhere]">
          @{username}
          {note ? <span> &middot; {note}</span> : null}
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-2">{children}</div>
    </li>
  );
}
