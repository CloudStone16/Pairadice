import "server-only";
import { cache } from "react";
import { query, queryAs } from "@/lib/db";
import { runAsViewer } from "@/lib/mutations/run";
import type { Viewer } from "@/lib/auth/viewer";
import type { HostAccount, QuestCatalog } from "@/components/quest/types";

// Everything the quest creator offers. Catalogue tables are read through the "web" pool.

interface PlatformRow {
  game_id: number;
  platform_id: number;
  name: string;
  identity_label: string;
}

/** Platforms each game is available on (game_platform), excluding social platforms such as Discord. */
async function loadPlatforms(): Promise<QuestCatalog["platforms"]> {
  return query<PlatformRow>(
    `SELECT gp.game_id, p.platform_id, p.name, p.identity_label
       FROM game_platform gp JOIN platform p ON p.platform_id = gp.platform_id
      WHERE p.platform_type <> 'social'
      ORDER BY gp.game_id, p.name`,
  );
}

export const getQuestCatalog = cache(async (): Promise<QuestCatalog> => {
  const [games, modes, roles, ranks, regions, languages, tags] = await Promise.all([
    query<QuestCatalog["games"][number]>(
      "SELECT game_id, name, slug FROM game WHERE is_active = TRUE ORDER BY name",
    ),
    query<QuestCatalog["modes"][number]>(
      `SELECT mode_id, game_id, name, min_team_size, max_team_size, is_ranked
         FROM game_mode ORDER BY game_id, name`,
    ),
    query<QuestCatalog["roles"][number]>(
      "SELECT game_role_id, game_id, name FROM game_role ORDER BY game_id, name",
    ),
    query<QuestCatalog["ranks"][number]>(
      "SELECT rank_id, game_id, name, ordinal FROM rank_tier ORDER BY game_id, ordinal",
    ),
    query<QuestCatalog["regions"][number]>(
      "SELECT region_id, name FROM geo_region WHERE region_level = 'matchmaking' ORDER BY name",
    ),
    query<QuestCatalog["languages"][number]>("SELECT language_code, name FROM language ORDER BY name"),
    query<QuestCatalog["tags"][number]>("SELECT tag_id, name, category FROM tag ORDER BY category, name"),
  ]);
  const platforms = await loadPlatforms();
  return {
    games,
    modes: modes.map((m) => ({ ...m, is_ranked: Boolean(m.is_ranked) })),
    roles,
    ranks,
    platforms,
    regions,
    languages,
    tags,
  };
});

interface AccountRow {
  account_id: number | string;
  platform_id: number;
  handle: string;
  discriminator: string;
}

/**
 * The viewer's own platform accounts, handle included (the owner may see it). The player login has no
 * SELECT on platform_account, so this calls sp_my_platform_accounts, which returns only the caller's rows.
 * Returns null when the viewer has no write login (the form then hides the account picker).
 */
export async function getHostAccounts(viewer: Viewer): Promise<HostAccount[] | null> {
  const res = await runAsViewer(viewer, async (login) => {
    // CALL returns [resultSet, OkPacket]; the first element is the procedure's rows
    const sets = await queryAs<AccountRow[]>(login, "CALL sp_my_platform_accounts(?)", [viewer.userId]);
    return (sets[0] ?? []) as unknown as AccountRow[];
  });
  if (!res.ok) return null;
  return res.value.map((r) => ({
    account_id: Number(r.account_id),
    platform_id: r.platform_id,
    label: r.discriminator ? `${r.handle}#${r.discriminator.replace(/^#/, "")}` : r.handle,
  }));
}
