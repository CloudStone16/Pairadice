import "server-only";
import { cache } from "react";
import { query, queryAs } from "@/lib/db";
import { runAsViewer } from "@/lib/mutations/run";
import type { Viewer } from "@/lib/auth/viewer";
import type { HostAccount, QuestCatalog } from "@/components/quest/types";

// Everything the quest creator offers. Catalogue tables are read through the "web" pool.

type PlatformRow = Omit<QuestCatalog["platforms"][number], "game_id">;

/**
 * Platforms per game. Neither "web" nor "player" may read game_platform and "web" may not read platform,
 * so this goes through the viewer's write login: game_platform when that login may read it (admin),
 * otherwise every platform for every game (the database still rejects nothing here, so the form simply
 * offers the full list).
 */
async function loadPlatforms(viewer: Viewer, gameIds: number[]): Promise<QuestCatalog["platforms"]> {
  const res = await runAsViewer(viewer, async (login) => {
    const all = await queryAs<PlatformRow>(
      login,
      "SELECT platform_id, name, identity_label FROM platform WHERE platform_type <> 'social' ORDER BY name",
    );
    try {
      return {
        all,
        links: await queryAs<{ game_id: number; platform_id: number }>(
          login,
          "SELECT game_id, platform_id FROM game_platform",
        ),
      };
    } catch {
      return { all, links: null };
    }
  });
  if (!res.ok) throw new Error(res.message);
  const { all, links } = res.value;
  if (!links) return gameIds.flatMap((game_id) => all.map((p) => ({ ...p, game_id })));
  return links.flatMap((l) => {
    const p = all.find((x) => x.platform_id === l.platform_id);
    return p ? [{ ...p, game_id: l.game_id }] : [];
  });
}

export const getQuestCatalog = cache(async (viewer: Viewer): Promise<QuestCatalog> => {
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
  const platforms = await loadPlatforms(viewer, games.map((g) => g.game_id));
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
 * The viewer's own platform accounts, handle included (the owner may see it). Neither the "web" nor the
 * "player" MySQL role has SELECT on platform_account, so this goes through the viewer's write login and
 * returns null when that login is not allowed to read it (the form then hides the account picker and the
 * database still validates any account id on submit).
 */
export async function getHostAccounts(viewer: Viewer): Promise<HostAccount[] | null> {
  const res = await runAsViewer(viewer, (login) =>
    queryAs<AccountRow>(
      login,
      `SELECT account_id, platform_id, handle, discriminator
         FROM platform_account WHERE user_id = ? ORDER BY platform_id, handle`,
      [viewer.userId],
    ),
  );
  if (!res.ok) return null;
  return res.value.map((r) => ({
    account_id: Number(r.account_id),
    platform_id: r.platform_id,
    label: r.discriminator ? `${r.handle}#${r.discriminator.replace(/^#/, "")}` : r.handle,
  }));
}
