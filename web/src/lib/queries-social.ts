import "server-only";
import { query, queryAs, type SqlParam } from "@/lib/db";
import { runAsViewer, type ActionResult } from "@/lib/mutations/run";
import type { Viewer } from "@/lib/auth/viewer";
import { USER_COLS, notBlockedWith } from "@/lib/sql-parts";
import type { UserLite } from "@/lib/types";

export type Relation = "none" | "friend" | "incoming" | "outgoing" | "blocked";

export interface SocialPerson {
  user_id: number;
  username: string;
  display_name: string;
  status: string;
}

export interface FriendOverview {
  friend: SocialPerson[];
  incoming: SocialPerson[];
  outgoing: SocialPerson[];
  blocked: SocialPerson[];
}

interface OverviewRow {
  relation: Exclude<Relation, "none">;
  user_id: number | string;
  username: string;
  display_name: string;
  status: string;
}

/**
 * Friends, requests and blocks of the viewer, from sp_friend_overview (public fields only, no gamertags).
 * It runs through the viewer's role login, so a suspended viewer gets the database/role message instead.
 */
export async function getFriendOverview(viewer: Viewer): Promise<ActionResult<FriendOverview>> {
  return runAsViewer(viewer, async (login) => {
    // CALL returns [resultSet, OkPacket]; the first element is the procedure's rows
    const sets = await queryAs<OverviewRow[]>(login, "CALL sp_friend_overview(?)", [viewer.userId]);
    const rows = (sets[0] ?? []) as unknown as OverviewRow[];
    const out: FriendOverview = { friend: [], incoming: [], outgoing: [], blocked: [] };
    for (const r of rows) {
      out[r.relation]?.push({
        user_id: Number(r.user_id),
        username: r.username,
        display_name: r.display_name,
        status: r.status,
      });
    }
    return out;
  });
}

/** How the viewer stands with one other player. A block placed by the other player is not revealed ("none"). */
export function relationFrom(overview: FriendOverview, otherId: number): Relation {
  for (const key of ["friend", "incoming", "outgoing", "blocked"] as const) {
    if (overview[key].some((p) => p.user_id === otherId)) return key;
  }
  return "none";
}

export async function getRelation(viewer: Viewer, otherId: number): Promise<ActionResult<Relation>> {
  const res = await getFriendOverview(viewer);
  return res.ok ? { ok: true, value: relationFrom(res.value, otherId) } : res;
}

/** Escape LIKE wildcards so the term is matched literally. */
function likePrefix(term: string): string {
  return `${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Active players whose username or display name starts with the term; never the viewer or a blocked pair. */
export async function searchPlayers(term: string, viewer: Viewer): Promise<UserLite[]> {
  const t = term.trim().slice(0, 40);
  if (t.length < 2) return [];
  const like = likePrefix(t);
  const params: SqlParam[] = [viewer.userId, like, like, viewer.userId, viewer.userId];
  return query<UserLite>(
    `SELECT ${USER_COLS}
       FROM users u
      WHERE u.status = 'active' AND u.user_id <> ?
        AND (u.username LIKE ? OR u.display_name LIKE ?)
        AND ${notBlockedWith("u")}
      ORDER BY u.display_name, u.user_id
      LIMIT 10`,
    params,
  );
}
