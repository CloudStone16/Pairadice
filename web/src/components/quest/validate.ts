import type {
  HostAccount,
  QuestCatalog,
  QuestField,
  QuestInput,
  QuestValues,
} from "./types";

// Friendly validation for the quest form. The database (sp_create_session and its triggers) stays the
// authority; this only gives per-field messages before the round trip. Pure, so it is unit-tested.

export type QuestValidation =
  | { ok: true; input: QuestInput }
  | { ok: false; errors: Partial<Record<QuestField, string>> };

function one(values: QuestValues, key: string): string {
  const v = values[key];
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}
function many(values: QuestValues, key: string): string[] {
  const v = values[key];
  return Array.isArray(v) ? v : v ? [v] : [];
}
function intOrNull(s: string): number | null {
  return /^\d{1,10}$/.test(s) ? Number(s) : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

function utcString(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`;
}

/** Milliseconds a zone is ahead of UTC at the given instant. */
function zoneOffsetMs(tz: string, atMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(atMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - Math.floor(atMs / 1000) * 1000;
}

/**
 * "YYYY-MM-DDTHH:MM" typed in the browser's zone to a UTC instant (ms), or null if malformed.
 * `tzOffsetMinutes` is Date.getTimezoneOffset() (UTC minus local); without it the fallback IANA zone is used.
 */
export function localToUtcMs(local: string, tzOffsetMinutes: number | null, fallbackTz: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number) as [number, number, number, number, number];
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const check = new Date(asUtc);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  if (tzOffsetMinutes !== null) return asUtc + tzOffsetMinutes * 60_000;
  try {
    const off = zoneOffsetMs(fallbackTz, asUtc);
    return asUtc - zoneOffsetMs(fallbackTz, asUtc - off);
  } catch {
    return asUtc;
  }
}

export function validateQuest(
  values: QuestValues,
  catalog: QuestCatalog,
  accounts: HostAccount[] | null,
  now: Date,
  fallbackTz: string,
): QuestValidation {
  const errors: Partial<Record<QuestField, string>> = {};

  const title = one(values, "title");
  if (title.length < 3 || title.length > 120) errors.title = "Give the quest a title of 3 to 120 characters.";
  const descRaw = one(values, "description");
  if (descRaw.length > 2000) errors.description = "Keep the description under 2000 characters.";

  const gameId = intOrNull(one(values, "game"));
  const game = catalog.games.find((g) => g.game_id === gameId);
  if (!game) errors.game = "Pick a game.";

  const modeId = intOrNull(one(values, "mode"));
  const mode = catalog.modes.find((m) => m.mode_id === modeId && m.game_id === game?.game_id);
  if (!mode) errors.mode = game ? "Pick a mode for this game." : "Pick a game first.";

  const platformId = intOrNull(one(values, "platform"));
  const platform = catalog.platforms.find((p) => p.platform_id === platformId && p.game_id === game?.game_id);
  if (!platform) errors.platform = game ? "Pick a platform this game runs on." : "Pick a game first.";

  const regionRaw = one(values, "region");
  const regionId = regionRaw === "" ? null : intOrNull(regionRaw);
  if (regionRaw !== "" && !catalog.regions.some((r) => r.region_id === regionId)) errors.region = "Pick a listed region.";
  const regionLocked = one(values, "regionLocked") === "on";
  if (regionLocked && regionId === null) errors.region = "Choose a region to lock the quest to it.";

  const maxPlayers = intOrNull(one(values, "maxPlayers"));
  if (maxPlayers === null || maxPlayers < 1) {
    errors.maxPlayers = "Enter how many players the party holds, host included.";
  } else if (mode && (maxPlayers < mode.min_team_size || maxPlayers > mode.max_team_size)) {
    errors.maxPlayers = `${mode.name} takes ${mode.min_team_size === mode.max_team_size ? mode.max_team_size : `${mode.min_team_size} to ${mode.max_team_size}`} players.`;
  }

  // roles needed: need_<roleId> = count
  const slots: Array<{ role_id: number; needed: number }> = [];
  let totalNeeded = 0;
  let rolesError: string | undefined;
  for (const role of catalog.roles.filter((r) => r.game_id === game?.game_id)) {
    const raw = one(values, `need_${role.game_role_id}`);
    if (raw === "") continue;
    const n = intOrNull(raw);
    if (n === null) {
      rolesError = `Enter a whole number for ${role.name}.`;
      continue;
    }
    if (n >= 1) {
      slots.push({ role_id: role.game_role_id, needed: n });
      totalNeeded += n;
    }
  }
  if (!rolesError && maxPlayers !== null && totalNeeded + 1 > maxPlayers) {
    rolesError = `Roles needed (${totalNeeded}) plus you must fit in ${maxPlayers} seats.`;
  }
  if (rolesError) errors.roles = rolesError;

  const hostRoleRaw = one(values, "hostRole");
  const hostRoleId = hostRoleRaw === "" ? null : intOrNull(hostRoleRaw);
  if (hostRoleRaw !== "" && !catalog.roles.some((r) => r.game_role_id === hostRoleId && r.game_id === game?.game_id)) {
    errors.hostRole = "Pick one of this game's roles.";
  }

  const accRaw = one(values, "hostAccount");
  const hostAccountId = accRaw === "" ? null : intOrNull(accRaw);
  if (accRaw !== "") {
    const acc = accounts?.find((a) => a.account_id === hostAccountId);
    if (accounts && !acc) errors.hostAccount = "Pick one of your own accounts.";
    else if (acc && platform && acc.platform_id !== platform.platform_id) {
      errors.hostAccount = "That account is on a different platform than the quest.";
    }
  }

  const languageCodes = [...new Set(many(values, "languages"))];
  if (languageCodes.length === 0) errors.languages = "Pick at least one language.";
  else if (languageCodes.some((c) => !catalog.languages.some((l) => l.language_code === c))) {
    errors.languages = "Pick languages from the list.";
  }

  const tagIds = [...new Set(many(values, "tags").map((t) => intOrNull(t)))];
  if (tagIds.some((t) => t === null || !catalog.tags.some((x) => x.tag_id === t))) errors.tags = "Pick tags from the list.";

  const vis = one(values, "visibility") || "public";
  if (vis !== "public" && vis !== "friends" && vis !== "invite") errors.visibility = "Choose who can see the quest.";
  const policy = one(values, "joinPolicy") || "approval";
  if (policy !== "approval" && policy !== "auto") errors.joinPolicy = "Choose how people join.";

  const minRankRaw = one(values, "minRank");
  const maxRankRaw = one(values, "maxRank");
  const minRankId = minRankRaw === "" ? null : intOrNull(minRankRaw);
  const maxRankId = maxRankRaw === "" ? null : intOrNull(maxRankRaw);
  const minRank = catalog.ranks.find((r) => r.rank_id === minRankId && r.game_id === game?.game_id);
  const maxRank = catalog.ranks.find((r) => r.rank_id === maxRankId && r.game_id === game?.game_id);
  if ((minRankRaw !== "" && !minRank) || (maxRankRaw !== "" && !maxRank)) {
    errors.rankRange = "Pick ranks from this game's ladder.";
  } else if (minRank && maxRank && minRank.ordinal > maxRank.ordinal) {
    errors.rankRange = "The lowest rank must not be above the highest rank.";
  }

  const ratingRaw = one(values, "minRating");
  let minAvgRating: number | null = null;
  if (ratingRaw !== "") {
    const r = /^\d(\.\d{1,2})?$/.test(ratingRaw) ? Number(ratingRaw) : NaN;
    if (!(r >= 1 && r <= 5)) errors.minRating = "Enter a rating from 1 to 5, or leave it empty.";
    else minAvgRating = r;
  }

  let scheduledStartUtc: string | null = null;
  const startRaw = one(values, "scheduledStart");
  if (startRaw !== "") {
    const offRaw = one(values, "tzOffset");
    const off = /^-?\d{1,4}$/.test(offRaw) ? Number(offRaw) : null;
    const ms = localToUtcMs(startRaw, off, fallbackTz);
    if (ms === null) errors.scheduledStart = "Enter a valid date and time.";
    else if (ms <= now.getTime()) errors.scheduledStart = "Pick a start time in the future, or leave it empty.";
    else scheduledStartUtc = utcString(ms);
  }

  if (Object.keys(errors).length > 0 || !game || !mode || !platform || maxPlayers === null) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    input: {
      gameId: game.game_id,
      modeId: mode.mode_id,
      platformId: platform.platform_id,
      regionId,
      title,
      description: descRaw === "" ? null : descRaw,
      maxPlayers,
      scheduledStartUtc,
      regionLocked,
      voiceRequired: one(values, "voiceRequired") === "on",
      visibility: vis as QuestInput["visibility"],
      joinPolicy: policy as QuestInput["joinPolicy"],
      minRankId,
      maxRankId,
      minAvgRating,
      hostRoleId,
      hostAccountId,
      slots,
      languageCodes,
      tagIds: tagIds as number[],
    },
  };
}
