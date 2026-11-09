import type { Metadata } from "next";
import { FriendList } from "@/components/hearth/FriendList";
import { PlayerRow } from "@/components/social/PlayerRow";
import { SocialAction } from "@/components/social/SocialAction";
import { SocialStatus } from "@/components/social/SocialStatus";
import { Chip, Sprite, Window, Button } from "@/components/ui";
import { FormAlert } from "@/components/auth/FormAlert";
import { requireViewer } from "@/lib/auth/guards";
import { getFriendLists } from "@/lib/queries";
import { getFriendOverview, relationFrom, searchPlayers, type FriendOverview } from "@/lib/queries-social";

export const metadata: Metadata = { title: "Friends | PairADice" };

const EMPTY: FriendOverview = { friend: [], incoming: [], outgoing: [], blocked: [] };

export default async function FriendsPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const viewer = await requireViewer("/friends");
  const { q: rawQ } = await searchParams;
  const q = (Array.isArray(rawQ) ? rawQ[0] : rawQ)?.trim().slice(0, 40) ?? "";

  const [overviewRes, lists, found] = await Promise.all([
    getFriendOverview(viewer),
    getFriendLists(viewer.userId),
    searchPlayers(q, viewer),
  ]);
  const overview = overviewRes.ok ? overviewRes.value : EMPTY;

  return (
    <div className="flex flex-col gap-10">
      <header>
        <h1 className="font-display text-3xl font-bold [text-shadow:0_2px_0_var(--color-ink)]">Friends</h1>
        <p className="text-lavender">The folks you share a fire with.</p>
      </header>

      <SocialStatus>
        {overviewRes.ok ? null : <FormAlert message={overviewRes.message} />}

        <Window title={`Requests waiting on you (${overview.incoming.length})`}>
          {overview.incoming.length === 0 ? (
            <p className="text-sm text-lavender">No pending requests from others.</p>
          ) : (
            <ul role="list" className="flex flex-col gap-3">
              {overview.incoming.map((p) => (
                <PlayerRow key={p.user_id} userId={p.user_id} displayName={p.display_name} username={p.username}>
                  <SocialAction kind="accept" userId={p.user_id} name={p.display_name} />
                  <SocialAction kind="decline" userId={p.user_id} name={p.display_name} />
                </PlayerRow>
              ))}
            </ul>
          )}
        </Window>

        <Window title={`Sent requests (${overview.outgoing.length})`}>
          {overview.outgoing.length === 0 ? (
            <p className="text-sm text-lavender">You have no outgoing requests.</p>
          ) : (
            <ul role="list" className="flex flex-col gap-3">
              {overview.outgoing.map((p) => (
                <PlayerRow key={p.user_id} userId={p.user_id} displayName={p.display_name} username={p.username}>
                  <SocialAction kind="cancel" userId={p.user_id} name={p.display_name} />
                </PlayerRow>
              ))}
            </ul>
          )}
        </Window>

        <FriendList
          title="Friends"
          friends={lists.accepted}
          empty="No friends yet. Good company is on the Quest Board."
          action={(f) => <SocialAction kind="remove" userId={f.user_id} name={f.display_name} />}
        />

        <Window title="Find players">
          <form method="get" action="/friends" role="search" className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <label htmlFor="friend-search" className="text-sm font-semibold">
                Username or display name (at least 2 letters)
              </label>
              <input
                id="friend-search"
                name="q"
                type="search"
                defaultValue={q}
                minLength={2}
                maxLength={40}
                autoComplete="off"
                className="min-h-11 w-full rounded-chip border-2 border-ink bg-[#fbf5e6] px-3 py-2 text-base text-ink"
              />
            </div>
            <Button type="submit" variant="blue">
              <Sprite name="icon-search" />
              Search
            </Button>
          </form>
          {q.length >= 2 ? (
            <div className="mt-4">
              {found.length === 0 ? (
                <p className="text-sm text-lavender">No players found for &ldquo;{q}&rdquo;.</p>
              ) : (
                <ul role="list" className="flex flex-col gap-3">
                  {found.map((p) => {
                    const rel = relationFrom(overview, p.user_id);
                    return (
                      <PlayerRow key={p.user_id} userId={p.user_id} displayName={p.display_name} username={p.username}>
                        {rel === "none" ? <SocialAction kind="send" userId={p.user_id} name={p.display_name} /> : null}
                        {rel === "friend" ? (
                          <Chip tone="green" icon={<Sprite name="icon-user-check" />}>
                            Friends
                          </Chip>
                        ) : null}
                        {rel === "outgoing" ? (
                          <Chip tone="lavender" icon={<Sprite name="icon-mail-incoming" />}>
                            Requested
                          </Chip>
                        ) : null}
                        {rel === "incoming" ? (
                          <>
                            <SocialAction kind="accept" userId={p.user_id} name={p.display_name} />
                            <SocialAction kind="decline" userId={p.user_id} name={p.display_name} />
                          </>
                        ) : null}
                      </PlayerRow>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : q.length > 0 ? (
            <p className="mt-4 text-sm text-lavender">Type at least 2 letters to search.</p>
          ) : null}
        </Window>

        <Window title="Blocked players">
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 rounded-sm font-semibold">
              <Sprite name="icon-block" />
              Show list ({overview.blocked.length})
            </summary>
            <div className="mt-3">
              {overview.blocked.length === 0 ? (
                <p className="text-sm text-lavender">You have not blocked anyone.</p>
              ) : (
                <ul role="list" className="flex flex-col gap-3">
                  {overview.blocked.map((p) => (
                    <PlayerRow key={p.user_id} userId={p.user_id} displayName={p.display_name} username={p.username}>
                      <SocialAction kind="unblock" userId={p.user_id} name={p.display_name} />
                    </PlayerRow>
                  ))}
                </ul>
              )}
            </div>
          </details>
        </Window>
      </SocialStatus>
    </div>
  );
}
