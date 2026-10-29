/**
 * CONTRACT: every sprite the art agent produces lives at
 * public/sprites/<name>.svg. Keep this list in sync with that directory.
 */
export const SPRITE_NAMES = [
  "dice-32",
  "dice-16",
  "cart-minecraft",
  "cart-valorant",
  "cart-fortnite",
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
  "icon-crown",
  "icon-shield",
  "icon-star",
  "icon-heart",
  "icon-controller",
  "icon-mic",
  "icon-gear",
  "icon-bell",
  "icon-chat",
  "icon-lock",
  "icon-globe",
  "icon-flag",
  "icon-seat",
  "icon-knock",
  "icon-clock",
  "icon-scroll",
  "icon-home",
  "icon-board",
  "icon-party",
  "icon-friends",
  "icon-character",
  "campfire-1",
  "campfire-2",
  "campfire-3",
  "campfire-4",
  "tile-cork",
  "tile-wood",
  "deco-star",
  "deco-moon",
] as const;

export type SpriteName = (typeof SPRITE_NAMES)[number];

const KNOWN = new Set<string>(SPRITE_NAMES);

export function isSpriteName(name: string): name is SpriteName {
  return KNOWN.has(name);
}
