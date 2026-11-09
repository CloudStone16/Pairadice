import Link from "next/link";
import type { UserChip } from "@/lib/moderation/types";

/** A player's display name linking to their character sheet, with @username for certainty. */
export function PlayerLink({ user, className = "" }: { user: UserChip; className?: string }) {
  return (
    <span className={`[overflow-wrap:anywhere] ${className}`}>
      <Link href={`/character/${user.userId}`} className="font-semibold underline underline-offset-2">
        {user.displayName}
      </Link>{" "}
      <span className="text-[15px] opacity-80">@{user.username}</span>
    </span>
  );
}
