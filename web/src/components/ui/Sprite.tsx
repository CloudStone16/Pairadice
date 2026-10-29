import { SPRITES } from "@/lib/sprites.generated";
import type { SpriteName } from "@/lib/sprite-names";

export interface SpriteProps {
  name: SpriteName;
  /** Native pixel size of the sprite. Defaults to the size recorded by the sprite build. */
  size?: number;
  /** Whole-number multiplier applied to size, so pixels stay even. Rounded and clamped to >= 1. */
  scale?: number;
  /** Omit or pass "" for decorative sprites (aria-hidden). */
  alt?: string;
  className?: string;
}

const DISPLAY_UTILITIES = new Set([
  "block",
  "inline-block",
  "inline",
  "flex",
  "inline-flex",
  "grid",
  "inline-grid",
  "hidden",
  "contents",
]);

/** True when the caller already chose a display utility (with or without a variant prefix, e.g. `hidden sm:block`). */
function hasDisplayClass(className: string): boolean {
  return className
    .split(/\s+/)
    .some((token) => DISPLAY_UTILITIES.has(token.slice(token.lastIndexOf(":") + 1)));
}

export function defaultSpriteSize(name: SpriteName): number {
  return SPRITES[name].size;
}

/**
 * A pixel-art sprite. A plain server <img>: the files are guaranteed to exist
 * by `bun run sprites` (which also generates the typed manifest used here).
 */
export function Sprite({ name, size, scale = 1, alt = "", className = "" }: SpriteProps) {
  const px = (size ?? defaultSpriteSize(name)) * Math.max(1, Math.round(scale));
  const decorative = alt === "";

  return (
    // eslint-disable-next-line @next/next/no-img-element -- pixel-art SVGs must not be optimised/blurred
    <img
      src={`/sprites/${name}.svg`}
      width={px}
      height={px}
      alt={alt}
      aria-hidden={decorative ? true : undefined}
      draggable={false}
      className={`pixelated shrink-0 align-middle ${hasDisplayClass(className) ? "" : "inline-block"} ${className}`}
    />
  );
}
