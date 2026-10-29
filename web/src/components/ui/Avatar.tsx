import { Sprite } from "./Sprite";
import type { SpriteName } from "@/lib/sprite-names";

/** Sprites are authored at 32px: 16 is half, 32 native, 64 double. */
export type AvatarSize = 16 | 32 | 64;
export type AvatarStatus = "online" | "ingame" | "idle" | "away" | "suspended";

const STATUS_LABEL: Record<AvatarStatus, string> = {
  online: "Online",
  ingame: "In game",
  idle: "Idle",
  away: "Away",
  suspended: "Suspended",
};

const AVATARS: readonly SpriteName[] = [
  "avatar-01",
  "avatar-02",
  "avatar-03",
  "avatar-04",
  "avatar-05",
  "avatar-06",
  "avatar-07",
  "avatar-08",
  "avatar-09",
  "avatar-10",
  "avatar-11",
  "avatar-12",
];

export function avatarSpriteName(userId: number): SpriteName {
  const index = (((Math.trunc(userId) - 1) % AVATARS.length) + AVATARS.length) % AVATARS.length;
  return AVATARS[index] ?? "avatar-01";
}

/**
 * Presence marker with a distinct silhouette per status, so it never relies on
 * colour alone: filled disc / disc with core / half disc / hollow ring / square with a cross.
 */
function StatusDot({ status, px }: { status: AvatarStatus; px: number }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={px}
      height={px}
      viewBox="0 0 14 14"
      className="absolute -bottom-1 -right-1"
    >
      {status === "suspended" ? (
        <>
          <rect x="0" y="0" width="14" height="14" fill="#120e1f" />
          <rect x="1.5" y="1.5" width="11" height="11" fill="#e8665f" />
          <path d="M4.5 4.5l5 5m0-5l-5 5" stroke="#120e1f" strokeWidth="1.6" strokeLinecap="square" />
        </>
      ) : (
        <>
          <circle cx="7" cy="7" r="7" fill="#120e1f" />
          {status === "online" ? <circle cx="7" cy="7" r="5.2" fill="#72c374" /> : null}
          {status === "ingame" ? (
            <>
              <circle cx="7" cy="7" r="5.2" fill="#6a95e6" />
              <circle cx="7" cy="7" r="2" fill="#f3ead3" />
            </>
          ) : null}
          {status === "idle" ? (
            <>
              <circle cx="7" cy="7" r="4.4" fill="none" stroke="#f2c35b" strokeWidth="1.6" />
              <path d="M7 2.6a4.4 4.4 0 0 0 0 8.8z" fill="#f2c35b" />
            </>
          ) : null}
          {status === "away" ? (
            <circle cx="7" cy="7" r="4.4" fill="none" stroke="#a094d6" strokeWidth="1.8" />
          ) : null}
        </>
      )}
    </svg>
  );
}

export interface AvatarProps {
  userId: number;
  size?: AvatarSize;
  status?: AvatarStatus;
  /** Accessible name for the avatar image; decorative when omitted. */
  alt?: string;
  /** Spell the status out for screen readers (default). Turn off when a parent already names it. */
  statusText?: boolean;
  className?: string;
}

export function Avatar({ userId, size = 32, status, alt = "", statusText = true, className = "" }: AvatarProps) {
  const dot = size <= 16 ? 10 : size >= 64 ? 16 : 12;
  return (
    <span
      className={`relative inline-flex shrink-0 rounded-xl bg-plum-2 ring-2 ring-ink ${className}`}
      style={{ width: size, height: size }}
    >
      <span className="inline-flex h-full w-full items-center justify-center overflow-hidden rounded-xl shadow-bevel">
        {/* sprites are authored at 32px; scale to the requested frame */}
        <Sprite name={avatarSpriteName(userId)} size={size} alt={alt} />
      </span>
      {status ? (
        <>
          <StatusDot status={status} px={dot} />
          {statusText ? <span className="sr-only">{STATUS_LABEL[status]}</span> : null}
        </>
      ) : null}
    </span>
  );
}
