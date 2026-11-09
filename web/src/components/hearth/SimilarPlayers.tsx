import { Avatar } from "@/components/ui";
import { getViewer } from "@/lib/auth/viewer";
import { queryAs } from "@/lib/db";
import { filterVisiblePlayers } from "@/lib/queries-social";
import { readCtx } from "@/lib/read-login";
import { similarPlayers } from "@/lib/vector/search";
import { UserLink } from "./UserLink";

const headingClass = "mb-2 mt-5 font-display text-sm font-semibold uppercase tracking-wider text-lavender";
const SHOW = 4;

interface Kindred {
  user_id: number;
  username: string;
  display_name: string;
  games: string[];
}

/** Public data only: never gamertags or in-game names. */
async function loadKindred(userId: number): Promise<Kindred[]> {
  const hits = await similarPlayers(userId, { k: 8 });
  const ids = hits.map((h) => Number(h._id));
  if (ids.length === 0) return [];
  // Drop anyone blocked in either direction (the vector store applies no safety filters) and anyone not active.
  // Runs as the viewer's own DB login: the anonymous web login cannot read user_block.
  const users = await filterVisiblePlayers(userId, ids);
  const byId = new Map(users.map((u) => [Number(u.user_id), u]));
  const kept = ids.filter((id) => byId.has(id)).slice(0, SHOW);
  if (kept.length === 0) return [];
  const { login } = await readCtx(userId);
  const shared = await queryAs<{ user_id: number; name: string }>(
    login,
    `SELECT DISTINCT p.user_id, g.name
       FROM player_game_profile p
       JOIN game g ON g.game_id = p.game_id
      WHERE p.user_id IN (?)
        AND p.game_id IN (SELECT m.game_id FROM player_game_profile m WHERE m.user_id = ?)
      ORDER BY g.name`,
    [kept, userId],
  );
  return kept.map((id) => {
    const u = byId.get(id);
    return {
      user_id: id,
      username: u?.username ?? "",
      display_name: u?.display_name ?? "",
      games: shared.filter((s) => Number(s.user_id) === id).map((s) => s.name),
    };
  });
}

/** "Kindred spirits": players with similar interests. Shows a quiet empty state if the vector store is down. */
export async function SimilarPlayers() {
  const viewer = await getViewer();
  let players: Kindred[] = [];
  if (viewer) {
    try {
      players = await loadKindred(viewer.userId);
    } catch {
      players = [];
    }
  }

  return (
    <section aria-labelledby="kindred-heading">
      <h3 id="kindred-heading" className={headingClass}>
        Kindred spirits
      </h3>
      {players.length === 0 ? (
        <p className="text-sm text-lavender">No kindred spirits to show right now. Check back after supper.</p>
      ) : (
        <ul role="list" className="space-y-3">
          {players.map((p) => (
            <li key={p.user_id} className="flex items-start gap-3">
              <Avatar userId={p.user_id} size={32} />
              <div className="min-w-0 flex-1 leading-tight">
                <UserLink userId={p.user_id} className="text-sm [overflow-wrap:anywhere]">
                  {p.display_name}
                </UserLink>
                <div className="text-sm text-lavender [overflow-wrap:anywhere]">@{p.username}</div>
                {p.games.length > 0 ? (
                  <div className="text-sm text-lavender [overflow-wrap:anywhere]">
                    <span className="sr-only">Shared games: </span>
                    {p.games.join(", ")}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
