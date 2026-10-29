import { Sprite } from "@/components/ui";
import type { SessionStatus } from "@/lib/types";

/** What the lock note says, depending on where the camp is in its life. */
export function lockedCopy(status: SessionStatus): string {
  switch (status) {
    case "completed":
      return "This adventure has ended";
    case "cancelled":
      return "This camp was packed up";
    default:
      return "Join the party to see gamertags and chat";
  }
}

/** Friendly note shown where private camp details (gamertags, chat) are hidden from non-members. */
export function LockedNote({ status, className = "" }: { status: SessionStatus; className?: string }) {
  return (
    <p
      className={`flex items-center gap-3 rounded-frame bg-ink/40 px-4 py-3 text-sm text-lavender ring-1 ring-inset ring-lavender/30 ${className}`}
    >
      <Sprite name="icon-lock" scale={2} />
      <span>{lockedCopy(status)}</span>
    </p>
  );
}
