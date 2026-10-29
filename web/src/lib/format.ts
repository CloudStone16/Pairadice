import { isSpriteName, type SpriteName } from "@/lib/sprite-names";
import type { QuestFit } from "@/lib/types";

/** "Zero Build Ranked" -> "zero-build-ranked"; diacritics are stripped ("Café" -> "cafe"). */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const tzCache = new Map<string, string>();

/** Falls back to UTC for invalid IANA names. */
export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return "UTC";
  const cached = tzCache.get(tz);
  if (cached !== undefined) return cached;
  let resolved = "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    resolved = tz;
  } catch {
    resolved = "UTC";
  }
  tzCache.set(tz, resolved);
  return resolved;
}

type FormatKind = "when" | "whenYear" | "stamp";

const FORMAT_OPTIONS: Record<FormatKind, Intl.DateTimeFormatOptions> = {
  when: {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  },
  whenYear: {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  },
  stamp: { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(kind: FormatKind, tz: string): Intl.DateTimeFormat {
  const zone = safeTimeZone(tz);
  const key = `${kind}|${zone}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { ...FORMAT_OPTIONS[kind], timeZone: zone });
    formatters.set(key, f);
  }
  return f;
}

/** Parses a MySQL UTC DATETIME string ("YYYY-MM-DD HH:MM:SS[.ffffff]"); null for zero/invalid dates. */
export function parseUtc(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const d = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  // Date.UTC rolls 02-31 over to 03-03; reject anything that did not round-trip.
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d;
}

const FAR_MS = 300 * 24 * 60 * 60 * 1000;

/** "Fri, Oct 30, 8:00 PM GMT+5:30" in the viewer's timezone; adds the year when far away. */
export function formatWhen(value: string | null | undefined, tz: string): string | null {
  const d = parseUtc(value);
  if (!d) return null;
  const far = Math.abs(d.getTime() - Date.now()) > FAR_MS;
  return formatterFor(far ? "whenYear" : "when", tz).format(d);
}

/** Compact timestamp for chat and message previews: "Oct 24, 3:10 PM". */
export function formatStamp(value: string | null | undefined, tz: string): string {
  const d = parseUtc(value);
  if (!d) return "";
  return formatterFor("stamp", tz).format(d);
}

export function splitList(value: unknown, sep = ","): string[] {
  if (value === null || value === undefined) return [];
  const s = String(value);
  return s === "" ? [] : s.split(sep).map((x) => x.trim()).filter(Boolean);
}

const displayNames =
  typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(["en"], { type: "language" })
    : null;

export function languageName(code: string): string {
  try {
    return displayNames?.of(code) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

/** Cartridge sprite for a game slug, with a dice fallback for unknown games. */
export function cartSprite(slug: string): SpriteName {
  const name = `cart-${slug}`;
  return isSpriteName(name) ? name : "dice-32";
}

const FIT_ORDER: Array<{ key: keyof QuestFit; min: number }> = [
  { key: "social_fit", min: 1 },
  { key: "rank_fit", min: 0.7 },
  { key: "avail_fit", min: 1 },
  { key: "tag_fit", min: 0.51 },
  { key: "rating_fit", min: 0.8 },
  { key: "region_fit", min: 0.6 },
];

function fitLabel(key: keyof QuestFit, value: number): string {
  switch (key) {
    case "rank_fit":
      return "Similar rank";
    case "avail_fit":
      return "Fits your schedule";
    case "tag_fit":
      return "Shared vibe";
    case "rating_fit":
      return "Great host";
    case "social_fit":
      return "Friends inside";
    case "region_fit":
      return value >= 1 ? "Your region" : "Nearby region";
  }
}

/** Top 2-3 reasons a quest matched, as short words. Neutral (0.5) scores never count. */
export function matchReasons(fit: QuestFit): string[] {
  return FIT_ORDER.map((f, i) => ({ ...f, i, value: fit[f.key] }))
    .filter((f) => f.value >= f.min)
    .sort((a, b) => b.value - a.value || a.i - b.i)
    .slice(0, 3)
    .map((f) => fitLabel(f.key, f.value));
}
