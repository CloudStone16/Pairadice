import "server-only";
import { callProcAs, queryAs } from "@/lib/db";
import { readCtx } from "@/lib/read-login";
import { formatMinutes, toMinutes } from "@/components/character/availability/slots";
import type { Viewer } from "@/lib/auth/viewer";
import {
  REGION_STRICTNESS,
  type AvailabilitySlot,
  type EditableAccount,
  type EditableGame,
  type EditableGameProfile,
  type Option,
  type ProfileEditData,
  type RegionStrictness,
} from "@/lib/profile/types";

// Everything the profile editor needs for the signed-in viewer. Every read runs on the viewer's own role
// login (never the anonymous "web" one). Own-row tables the player cannot read directly (users,
// platform_account) come through the self-only procedures sp_my_profile / sp_my_platform_accounts.

interface ProfileRow {
  username: string;
  display_name: string;
  bio: string | null;
  timezone: string;
  country_code: string | null;
  home_region_id: number | null;
  region_strictness: string;
}
interface AccountRow {
  account_id: number | string;
  platform_id: number;
  platform: string;
  handle: string;
  discriminator: string | null;
  is_public?: number | boolean | null;
}
interface ProfileKeyRow { profile_id: number | string; game_id: number; platform_account_id: number | string | null; rank_id: number | null }

/** "HH:MM:SS" -> "HH:MM"; MySQL TIME "24:00:00" (end of day) -> "23:59", same rule as the availability grid. */
const hhmm = (t: string): string => {
  const m = toMinutes(t);
  return m === null ? t.slice(0, 5) : formatMinutes(m);
};

function strictness(v: string): RegionStrictness {
  return (REGION_STRICTNESS as readonly string[]).includes(v) ? (v as RegionStrictness) : "nearby";
}

export async function getProfileEditData(viewer: Viewer): Promise<ProfileEditData> {
  const ctx = await readCtx(viewer);
  if (ctx.viewerId === null) throw new Error("Sign in to edit your profile.");
  const { login } = ctx;
  const uid = ctx.viewerId;

  const [
    profileRows, countries, regions, languages, myLanguages, tags, myTags, platforms,
    accountRows, games, gamePlatforms, modes, ranks, roles, profiles, profModes, profRoles, avail,
  ] = await Promise.all([
    callProcAs<ProfileRow>(login, "CALL sp_my_profile(?)", [uid]),
    queryAs<{ country_code: string; name: string }>(login, "SELECT country_code, name FROM country ORDER BY name"),
    queryAs<{ region_id: number; name: string }>(
      login, "SELECT region_id, name FROM geo_region WHERE region_level = 'matchmaking' ORDER BY name"),
    queryAs<{ language_code: string; name: string }>(login, "SELECT language_code, name FROM language ORDER BY name"),
    queryAs<{ language_code: string; is_preferred: number }>(
      login, "SELECT language_code, is_preferred FROM user_language WHERE user_id = ? ORDER BY language_code", [uid]),
    queryAs<{ tag_id: number; name: string }>(login, "SELECT tag_id, name FROM tag ORDER BY name"),
    queryAs<{ tag_id: number }>(login, "SELECT tag_id FROM user_tag WHERE user_id = ? ORDER BY tag_id", [uid]),
    queryAs<{ platform_id: number; name: string }>(login, "SELECT platform_id, name FROM platform ORDER BY name"),
    callProcAs<AccountRow>(login, "CALL sp_my_platform_accounts(?)", [uid]),
    queryAs<{ game_id: number; name: string; slug: string }>(
      login, "SELECT game_id, name, slug FROM game WHERE is_active = TRUE ORDER BY name"),
    queryAs<{ game_id: number; platform_id: number }>(
      login, "SELECT game_id, platform_id FROM game_platform ORDER BY game_id, platform_id"),
    queryAs<{ mode_id: number; game_id: number; name: string }>(
      login, "SELECT mode_id, game_id, name FROM game_mode ORDER BY game_id, name"),
    queryAs<{ rank_id: number; game_id: number; name: string }>(
      login, "SELECT rank_id, game_id, name FROM rank_tier ORDER BY game_id, ordinal"),
    queryAs<{ game_role_id: number; game_id: number; name: string }>(
      login, "SELECT game_role_id, game_id, name FROM game_role ORDER BY game_id, name"),
    queryAs<ProfileKeyRow>(
      login,
      `SELECT profile_id, game_id, platform_account_id, rank_id
         FROM player_game_profile WHERE user_id = ? ORDER BY profile_id`, [uid]),
    queryAs<{ profile_id: number | string; mode_id: number }>(
      login,
      `SELECT pm.profile_id, pm.mode_id FROM profile_mode pm
         JOIN player_game_profile p ON p.profile_id = pm.profile_id
        WHERE p.user_id = ? ORDER BY pm.profile_id, pm.mode_id`, [uid]),
    queryAs<{ profile_id: number | string; game_role_id: number }>(
      login,
      `SELECT pr.profile_id, pr.game_role_id FROM profile_role pr
         JOIN player_game_profile p ON p.profile_id = pr.profile_id
        WHERE p.user_id = ? ORDER BY pr.profile_id, pr.preference_order`, [uid]),
    queryAs<{ day_of_week: number; start_time: string; end_time: string }>(
      login,
      `SELECT day_of_week, start_time, end_time FROM availability
        WHERE user_id = ? ORDER BY day_of_week, start_time`, [uid]),
  ]);

  const me = profileRows[0];
  if (!me) throw new Error("Your profile could not be found.");

  const langSelected = myLanguages.map((l) => l.language_code);
  const primary = myLanguages.find((l) => Boolean(l.is_preferred))?.language_code ?? langSelected[0] ?? null;

  const opt = <T extends string | number>(value: T, label: string): Option<T> => ({ value, label });

  const byGame = <T extends { game_id: number }>(rows: T[], id: number): T[] => rows.filter((r) => r.game_id === id);
  const editableGames: EditableGame[] = games.map((g) => ({
    gameId: g.game_id,
    name: g.name,
    slug: g.slug,
    platformIds: byGame(gamePlatforms, g.game_id).map((r) => r.platform_id),
    modes: byGame(modes, g.game_id).map((m) => opt(m.mode_id, m.name)),
    ranks: byGame(ranks, g.game_id).map((r) => opt(r.rank_id, r.name)),
    roles: byGame(roles, g.game_id).map((r) => opt(r.game_role_id, r.name)),
  }));

  const activeGameIds = new Set(games.map((g) => g.game_id));
  const usedAccounts = new Set(
    profiles.filter((p) => p.platform_account_id !== null).map((p) => Number(p.platform_account_id)),
  );
  const accounts: EditableAccount[] = accountRows.map((a) => ({
    accountId: Number(a.account_id),
    platformId: a.platform_id,
    platformName: a.platform,
    handle: a.handle,
    discriminator: a.discriminator ? a.discriminator : null,
    isPublic: Boolean(a.is_public),
    inUse: usedAccounts.has(Number(a.account_id)),
  }));

  const gameProfiles: EditableGameProfile[] = profiles
    .filter((p) => activeGameIds.has(p.game_id))
    .map((p) => {
      const pid = Number(p.profile_id);
      return {
        profileId: pid,
        gameId: p.game_id,
        platformAccountId: p.platform_account_id === null ? null : Number(p.platform_account_id),
        rankId: p.rank_id,
        modeIds: profModes.filter((m) => Number(m.profile_id) === pid).map((m) => m.mode_id),
        roleIds: profRoles.filter((r) => Number(r.profile_id) === pid).map((r) => r.game_role_id),
      };
    });

  const availability: AvailabilitySlot[] = avail.map((a) => ({
    day: a.day_of_week,
    start: hhmm(a.start_time),
    end: hhmm(a.end_time),
  }));

  return {
    about: {
      username: me.username,
      displayName: me.display_name,
      bio: me.bio ?? "",
      timezone: me.timezone,
      countryCode: me.country_code,
      homeRegionId: me.home_region_id,
      regionStrictness: strictness(me.region_strictness),
    },
    countries: countries.map((c) => opt(c.country_code, c.name)),
    regions: regions.map((r) => opt(r.region_id, r.name)),
    languages: { all: languages.map((l) => opt(l.language_code, l.name)), selected: langSelected, primary },
    tags: { all: tags.map((t) => opt(t.tag_id, t.name)), selected: myTags.map((t) => t.tag_id) },
    platforms: platforms.map((p) => opt(p.platform_id, p.name)),
    accounts,
    games: editableGames,
    gameProfiles,
    availability,
  };
}
