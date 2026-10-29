import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/hearth/EmptyState";
import { QuestGrid } from "@/components/hearth/QuestGrid";
import { SignInGate } from "@/components/hearth/SignInGate";
import { Chip, Sprite, Window } from "@/components/ui";
import { cartSprite } from "@/lib/format";
import { resolveGame, resolveMode } from "@/lib/slugs";
import { OPEN_QUEST_LIMIT, getCurrentUser, getGames, getModes, getOpenQuests } from "@/lib/queries";

type Params = { slug?: string[] };

async function resolveSelection(slug: string[]) {
  const user = await getCurrentUser();
  if (!user) return null;
  const [games, modes] = await Promise.all([getGames(user.user_id), getModes()]);
  const game = resolveGame(games, slug[0]);
  const gameModes = game ? modes.filter((m) => m.game_id === game.game_id) : [];
  const mode = resolveMode(gameModes, slug[1]);
  return { user, game, gameModes, mode };
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug = [] } = await params;
  if (slug.length > 2) notFound();
  let sel: Awaited<ReturnType<typeof resolveSelection>>;
  try {
    sel = await resolveSelection(slug);
  } catch {
    // the page itself reports the real error; use the generic title meanwhile
    return { title: "Quest Board | PairADice" };
  }
  if (!sel) return { title: "Quest Board | PairADice" };
  // unknown games and modes (including id-style slugs like "1" or "5-competitive") are real 404s
  if ((slug[0] && !sel.game) || (slug[1] && !sel.mode)) notFound();
  if (sel.game) {
    const name = sel.mode ? `${sel.game.name} \u00b7 ${sel.mode.name}` : sel.game.name;
    return { title: `${name} quests | PairADice` };
  }
  return { title: "Quest Board | PairADice" };
}

export default async function BoardPage({ params }: { params: Promise<Params> }) {
  const { slug = [] } = await params;
  if (slug.length > 2) notFound();

  const sel = await resolveSelection(slug);
  if (!sel) return <SignInGate />;
  const { user, game, gameModes, mode } = sel;
  if (slug[0] && !game) notFound();
  if (slug[1] && !mode) notFound();

  const quests = await getOpenQuests(user.user_id, { gameId: game?.game_id, modeId: mode?.mode_id });
  const heading = mode ? `${game?.name} · ${mode.name}` : (game?.name ?? "Quest Board");
  const count = quests.length >= OPEN_QUEST_LIMIT ? `${OPEN_QUEST_LIMIT}+` : String(quests.length);

  return (
    <div className="flex flex-col gap-10">
      <Window variant="parchment">
        <div className="flex flex-wrap items-center gap-4">
          <Sprite name={game ? cartSprite(game.slug) : "icon-board"} scale={game ? 2 : 3} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-bold leading-tight [overflow-wrap:anywhere]">
              {heading}
            </h1>
            <p className="text-wood-dark">
              {mode?.description ??
                (game ? "Open quests for this game." : "Every open quest pinned up around the camp.")}
            </p>
          </div>
          <Chip tone="ember" className="shrink-0">
            {count} {quests.length === 1 ? "quest" : "quests"}
          </Chip>
        </div>
        {game && gameModes.length > 0 ? (
          <nav aria-label={`${game.name} modes`} className="mt-4">
            <ul role="list" className="flex flex-wrap gap-2">
              <li>
                <Link
                  href={`/board/${game.slug}`}
                  aria-current={!mode ? "page" : undefined}
                  className={`inline-block rounded-pill px-3 py-1 text-sm font-semibold ring-1 ring-wood/50 transition motion-safe:hover:-translate-y-0.5 ${
                    !mode ? "bg-ink text-cream forced-colors:outline-2 forced-colors:outline-[Highlight]" : "bg-parchment-dark text-ink"
                  }`}
                >
                  All modes
                </Link>
              </li>
              {gameModes.map((m) => (
                <li key={m.mode_id}>
                  <Link
                    href={`/board/${game.slug}/${m.slug}`}
                    aria-current={m.mode_id === mode?.mode_id ? "page" : undefined}
                    className={`inline-block rounded-pill px-3 py-1 text-sm font-semibold ring-1 ring-wood/50 transition motion-safe:hover:-translate-y-0.5 ${
                      m.mode_id === mode?.mode_id ? "bg-ink text-cream forced-colors:outline-2 forced-colors:outline-[Highlight]" : "bg-parchment-dark text-ink"
                    }`}
                  >
                    {m.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </Window>

      <section aria-labelledby="board-quests" className="flex flex-col gap-4">
        <h2 id="board-quests" className="sr-only">
          Open quests
        </h2>
        {quests.length === 0 ? (
          <EmptyState title="No quests posted here yet" sprite="icon-scroll">
            No quests posted here yet &mdash; check back soon. The board fills up around supper time.
          </EmptyState>
        ) : (
          <QuestGrid quests={quests} timeZone={user.timezone} />
        )}
      </section>
    </div>
  );
}
