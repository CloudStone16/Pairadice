// Pure, client-safe validators for the profile editor. They mirror the rules in database/11_profiles.sql
// so people get field-level messages, but the database stays the authority. Inputs are the raw FormData
// values collected as Record<string, string | string[]> (field names: src/lib/profile/types.ts).
import { toMinutes, formatMinutes } from "@/components/character/availability/slots";
import { LIMITS, REGION_STRICTNESS, type AvailabilitySlot, type RegionStrictness } from "./types";

export type RawInput = Record<string, string | string[] | undefined>;
export type FieldErrors = Record<string, string>;
export type Validated<T> = { ok: true; value: T } | { ok: false; fieldErrors: FieldErrors };

// Hard ceilings checked before any per-item work (DoS guard). Repeated fields allow 2x the real limit so
// the friendly "at most N" message still shows for a slightly long list.
const MAX_STRING = 2048;
const MAX_SLOTS_JSON = 8192;

function tooBig(values: string[], limit: number): boolean {
  return values.length > limit * 2 || values.some((s) => s.length > 256);
}

function one(input: RawInput, key: string): string {
  const v = input[key];
  return typeof v === "string" ? v : Array.isArray(v) ? (v[0] ?? "") : "";
}
function many(input: RawInput, key: string): string[] {
  const v = input[key];
  return Array.isArray(v) ? v : typeof v === "string" && v !== "" ? [v] : [];
}
function done<T>(errors: FieldErrors, value: T): Validated<T> {
  return Object.keys(errors).length > 0 ? { ok: false, fieldErrors: errors } : { ok: true, value };
}

const TIMEZONE_RE = /^(UTC|[A-Z][A-Za-z_]+(\/[A-Za-z0-9_+-]+){1,2})$/;
// HH:MM, with "24:00" allowed as end of day; toMinutes (same rule as the availability grid) normalises it to 23:59.
const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$|^24:00$/;

/** A positive decimal id, or null. */
export function parseId(raw: string): number | null {
  const s = raw.trim();
  if (!/^[0-9]{1,15}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Optional id: "" -> null (ok); invalid -> undefined. */
function optionalId(raw: string): number | null | undefined {
  if (raw.trim() === "") return null;
  return parseId(raw) ?? undefined;
}

function idList(values: string[], limit: number): number[] | null {
  if (tooBig(values, limit)) return null;
  const seen = new Set<number>();
  for (const v of values) {
    const id = parseId(v);
    if (id === null) return null;
    seen.add(id);
  }
  return [...seen];
}

// ---------------------------------------------------------------- about
export interface AboutValue {
  displayName: string;
  bio: string;
  timezone: string | null;
  countryCode: string | null;
  homeRegionId: number | null;
  regionStrictness: RegionStrictness | null;
}

export function validateAbout(input: RawInput): Validated<AboutValue> {
  const errors: FieldErrors = {};
  const rawName = one(input, "displayName");
  const displayName = rawName.length > MAX_STRING ? "" : rawName.trim();
  if (displayName.length < 1 || [...displayName].length > LIMITS.displayName) {
    errors.displayName = `Display name must be 1-${LIMITS.displayName} characters.`;
  }
  const rawBio = one(input, "bio");
  const bio = rawBio.length > MAX_STRING ? rawBio.slice(0, MAX_STRING) : rawBio.trim();
  if (rawBio.length > MAX_STRING || [...bio].length > LIMITS.bio) errors.bio = `Bio must be ${LIMITS.bio} characters or fewer.`;
  const tzRaw = one(input, "timezone").trim();
  const timezone = tzRaw === "" ? null : tzRaw;
  if (timezone !== null && (timezone.length > 64 || !TIMEZONE_RE.test(timezone))) {
    errors.timezone = "Timezone must be UTC or look like Area/City (for example Asia/Kolkata).";
  }
  const cc = one(input, "countryCode").trim().toUpperCase();
  const countryCode = cc === "" ? null : cc;
  if (countryCode !== null && !/^[A-Z]{2}$/.test(countryCode)) errors.countryCode = "Pick a country from the list.";
  const homeRegionId = optionalId(one(input, "homeRegionId"));
  if (homeRegionId === undefined) errors.homeRegionId = "Pick a region from the list.";
  const strictRaw = one(input, "regionStrictness").trim();
  const regionStrictness = strictRaw === "" ? null : strictRaw;
  if (regionStrictness !== null && !(REGION_STRICTNESS as readonly string[]).includes(regionStrictness)) {
    errors.regionStrictness = "Region matching must be strict, nearby or any.";
  }
  return done(errors, {
    displayName,
    bio,
    timezone,
    countryCode,
    homeRegionId: homeRegionId ?? null,
    regionStrictness: regionStrictness as RegionStrictness | null,
  });
}

// ---------------------------------------------------------------- languages
export interface LanguagesValue {
  codes: string[];
  primary: string | null;
}

export function validateLanguages(input: RawInput): Validated<LanguagesValue> {
  const errors: FieldErrors = {};
  const seen = new Set<string>();
  const rawCodes = many(input, "languages");
  if (tooBig(rawCodes, LIMITS.languages)) errors.languages = `Pick at most ${LIMITS.languages} languages.`;
  else {
    for (const raw of rawCodes) {
      const code = raw.trim().toLowerCase();
      if (!/^[a-z]{2}$/.test(code)) {
        errors.languages = "One of those languages is not recognised.";
        break;
      }
      seen.add(code);
    }
  }
  const codes = [...seen];
  if (!errors.languages) {
    if (codes.length < 1) errors.languages = "Pick at least one language.";
    else if (codes.length > LIMITS.languages) errors.languages = `Pick at most ${LIMITS.languages} languages.`;
  }
  const p = one(input, "primary").trim().toLowerCase();
  const primary = p === "" ? null : p;
  if (primary !== null && !seen.has(primary)) {
    errors.primary = "Your main language must be one of the languages you picked.";
  }
  return done(errors, { codes, primary });
}

// ---------------------------------------------------------------- tags
export function validateTags(input: RawInput): Validated<{ tagIds: number[] }> {
  const errors: FieldErrors = {};
  const ids = idList(many(input, "tags"), LIMITS.tags);
  if (ids === null) errors.tags = "One of those tags is not recognised.";
  else if (ids.length > LIMITS.tags) errors.tags = `Pick at most ${LIMITS.tags} tags.`;
  return done(errors, { tagIds: ids ?? [] });
}

// ---------------------------------------------------------------- accounts
export interface AccountValue {
  accountId: number | null;
  platformId: number;
  handle: string;
  discriminator: string;
  isPublic: boolean;
}

export function validateAccount(input: RawInput): Validated<AccountValue> {
  const errors: FieldErrors = {};
  const accountId = optionalId(one(input, "accountId"));
  if (accountId === undefined) errors.accountId = "That account could not be identified.";
  const platformId = parseId(one(input, "platformId"));
  if (platformId === null) errors.platformId = "Pick a platform.";
  const rawHandle = one(input, "handle");
  const handle = rawHandle.length > MAX_STRING ? "" : rawHandle.trim();
  if ([...handle].length < 1 || [...handle].length > LIMITS.handle) {
    errors.handle = `Gamertag must be 1-${LIMITS.handle} characters.`;
  }
  const rawDisc = one(input, "discriminator");
  const discriminator = rawDisc.length > MAX_STRING ? rawDisc.slice(0, MAX_STRING) : rawDisc.trim();
  if ([...discriminator].length > LIMITS.discriminator) {
    errors.discriminator = `Tag suffix must be ${LIMITS.discriminator} characters or fewer.`;
  }
  const isPublic = one(input, "isPublic") === "on";
  return done(errors, { accountId: accountId ?? null, platformId: platformId ?? 0, handle, discriminator, isPublic });
}

export function validateRemoveAccount(input: RawInput): Validated<{ accountId: number }> {
  const id = parseId(one(input, "accountId"));
  return id === null
    ? { ok: false, fieldErrors: { accountId: "That account could not be identified." } }
    : { ok: true, value: { accountId: id } };
}

// ---------------------------------------------------------------- game profiles
export interface GameProfileValue {
  gameId: number;
  platformAccountId: number | null;
  rankId: number | null;
  modeIds: number[];
  roles: Array<{ role_id: number; order: number }>;
}

export function validateGameProfile(input: RawInput): Validated<GameProfileValue> {
  const errors: FieldErrors = {};
  const gameId = parseId(one(input, "gameId"));
  if (gameId === null) errors.gameId = "Pick a game.";
  const platformAccountId = optionalId(one(input, "platformAccountId"));
  if (platformAccountId === undefined) errors.platformAccountId = "Pick an account from the list.";
  const rankId = optionalId(one(input, "rankId"));
  if (rankId === undefined) errors.rankId = "Pick a rank from the list.";
  const modeIds = idList(many(input, "modes"), LIMITS.modes);
  if (modeIds === null) errors.modes = "One of those modes is not recognised.";
  else if (modeIds.length > LIMITS.modes) errors.modes = `Pick at most ${LIMITS.modes} modes.`;

  const roleKeys = ["role1", "role2", "role3"] as const;
  const picked: Array<number | null> = [];
  roleKeys.forEach((key) => {
    const v = optionalId(one(input, key));
    if (v === undefined) {
      errors[key] = "Pick a role from the list.";
      picked.push(null);
    } else picked.push(v);
  });
  const roles: Array<{ role_id: number; order: number }> = [];
  picked.forEach((id, i) => {
    const key = roleKeys[i];
    if (id === null || errors[key]) return;
    if (i > 0 && picked[i - 1] === null) {
      errors[key] = `Choose role ${i} before role ${i + 1}.`;
      return;
    }
    if (picked.slice(0, i).includes(id)) { // at most 3 entries
      errors[key] = "Each role can only be chosen once.";
      return;
    }
    roles.push({ role_id: id, order: i + 1 });
  });
  return done(errors, {
    gameId: gameId ?? 0,
    platformAccountId: platformAccountId ?? null,
    rankId: rankId ?? null,
    modeIds: modeIds ?? [],
    roles,
  });
}

export function validateRemoveGameProfile(input: RawInput): Validated<{ profileId: number }> {
  const id = parseId(one(input, "profileId"));
  return id === null
    ? { ok: false, fieldErrors: { profileId: "That game profile could not be identified." } }
    : { ok: true, value: { profileId: id } };
}

// ---------------------------------------------------------------- availability
export function validateAvailability(input: RawInput): Validated<{ slots: AvailabilitySlot[] }> {
  const fail = (m: string): Validated<{ slots: AvailabilitySlot[] }> => ({ ok: false, fieldErrors: { slots: m } });
  const rawSlots = one(input, "slots");
  if (rawSlots.length > MAX_SLOTS_JSON) return fail(`At most ${LIMITS.availabilitySlots} time windows.`);
  const raw = rawSlots.trim();
  let parsed: unknown;
  try {
    parsed = raw === "" ? [] : JSON.parse(raw);
  } catch {
    return fail("The schedule could not be read. Reload the page and try again.");
  }
  if (!Array.isArray(parsed)) return fail("The schedule could not be read. Reload the page and try again.");
  if (parsed.length > LIMITS.availabilitySlots) return fail(`At most ${LIMITS.availabilitySlots} time windows.`);
  const slots: AvailabilitySlot[] = [];
  for (const item of parsed as unknown[]) {
    const s = (item ?? {}) as Record<string, unknown>;
    if (typeof s.day !== "number" || !Number.isInteger(s.day) || s.day < 0 || s.day > 6) {
      return fail("Each window needs a day from Monday to Sunday.");
    }
    const a = typeof s.start === "string" && TIME_RE.test(s.start) ? toMinutes(s.start) : null;
    const b = typeof s.end === "string" && TIME_RE.test(s.end) ? toMinutes(s.end) : null;
    if (a === null || b === null) return fail("Each window needs start and end times as HH:MM.");
    if (b <= a) return fail("Each window must end after it starts.");
    slots.push({ day: s.day, start: formatMinutes(a), end: formatMinutes(b) });
  }
  const byDay = [...slots].sort((x, y) => x.day - y.day || (x.start < y.start ? -1 : x.start > y.start ? 1 : 0));
  for (let i = 1; i < byDay.length; i++) {
    const prev = byDay[i - 1];
    const cur = byDay[i];
    if (prev.day === cur.day && cur.start < prev.end) return fail("Time windows on the same day cannot overlap.");
  }
  return { ok: true, value: { slots: byDay } };
}
