import type { SpriteName } from "@/lib/sprite-names";

/** Glyph for a platform by its display name; anything unknown gets the generic controller. */
export function platformSprite(platformName: string): SpriteName {
  const n = platformName.toLowerCase();
  if (n.includes("playstation") || n === "ps" || /\bps\d?\b/.test(n)) return "icon-platform-playstation";
  if (n.includes("xbox")) return "icon-platform-xbox";
  if (n.includes("switch") || n.includes("nintendo")) return "icon-platform-switch";
  if (n === "pc" || n.includes("windows") || n.includes("steam") || n.includes("epic")) return "icon-platform-pc";
  return "icon-controller";
}

/** Rank medal by position in the ordered rank list (6 buckets, low to high). Decorative only. */
export function rankMedal(index: number, count: number): SpriteName {
  const medals: SpriteName[] = ["rank-bronze", "rank-silver", "rank-gold", "rank-platinum", "rank-diamond", "rank-champion"];
  if (count <= 1) return "rank-bronze";
  const bucket = Math.min(medals.length - 1, Math.floor((index * medals.length) / count));
  return medals[bucket] ?? "rank-bronze";
}

export const COMMON_TIMEZONES = [
  "UTC",
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Halifax",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "America/Mexico_City",
  "Atlantic/Reykjavik",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Stockholm",
  "Europe/Athens",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Singapore",
  "Asia/Manila",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Seoul",
  "Asia/Tokyo",
  "Australia/Perth",
  "Australia/Sydney",
  "Pacific/Auckland",
];
