import "server-only";
import { callProcAs, execAs } from "@/lib/db";
import type { Viewer } from "@/lib/auth/viewer";
import { runAsViewer, type ActionResult } from "./run";
import type { AboutValue, AccountValue, GameProfileValue, LanguagesValue } from "@/lib/profile/validate";
import type { AvailabilitySlot } from "@/lib/profile/types";

// Profile editing. Each write is one stored procedure (database/11_profiles.sql); the viewer is always the
// actor, and the procedure validates, audits and words any refusal. Inputs here are already validated.

function call(viewer: Viewer, sql: string, params: Array<string | number | boolean | null>): Promise<ActionResult> {
  return runAsViewer(viewer, async (login) => {
    await execAs(login, sql, params);
  });
}

export const updateProfile = (v: Viewer, a: AboutValue) =>
  call(v, "CALL sp_update_profile(?, ?, ?, ?, ?, ?, ?)", [
    v.userId, a.displayName, a.bio, a.timezone, a.countryCode, a.homeRegionId, a.regionStrictness,
  ]);

export const setUserLanguages = (v: Viewer, l: LanguagesValue) =>
  call(v, "CALL sp_set_user_languages(?, ?, ?)", [v.userId, JSON.stringify(l.codes), l.primary]);

export const setUserTags = (v: Viewer, tagIds: number[]) =>
  call(v, "CALL sp_set_user_tags(?, ?)", [v.userId, JSON.stringify(tagIds)]);

export function upsertPlatformAccount(v: Viewer, a: AccountValue): Promise<ActionResult<number>> {
  return runAsViewer(v, async (login) => {
    const rows = await callProcAs<{ account_id: number | string }>(
      login,
      "CALL sp_upsert_platform_account(?, ?, ?, ?, ?, ?)",
      [v.userId, a.accountId, a.platformId, a.handle, a.discriminator, a.isPublic],
    );
    return Number(rows[0]?.account_id ?? 0);
  });
}

export const removePlatformAccount = (v: Viewer, accountId: number) =>
  call(v, "CALL sp_remove_platform_account(?, ?)", [v.userId, accountId]);

export function upsertGameProfile(v: Viewer, g: GameProfileValue): Promise<ActionResult<number>> {
  return runAsViewer(v, async (login) => {
    const rows = await callProcAs<{ profile_id: number | string }>(
      login,
      "CALL sp_upsert_game_profile(?, ?, ?, ?, ?, ?)",
      [v.userId, g.gameId, g.platformAccountId, g.rankId, JSON.stringify(g.modeIds), JSON.stringify(g.roles)],
    );
    return Number(rows[0]?.profile_id ?? 0);
  });
}

export const removeGameProfile = (v: Viewer, profileId: number) =>
  call(v, "CALL sp_remove_game_profile(?, ?)", [v.userId, profileId]);

export const setAvailability = (v: Viewer, slots: AvailabilitySlot[]) =>
  call(v, "CALL sp_set_availability(?, ?)", [v.userId, JSON.stringify(slots)]);
