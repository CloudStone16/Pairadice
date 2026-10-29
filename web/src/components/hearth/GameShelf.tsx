"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { Chip, Sprite, Window } from "@/components/ui";
import { cartSprite } from "@/lib/format";
import { resolveGame, resolveMode } from "@/lib/slugs";
import type { GameInfo, ModeInfo } from "@/lib/types";

/** Wooden shelf of game cartridges; each cartridge rests on its own plank and the selected game reveals its modes. */
export function GameShelf({ games, modes }: { games: GameInfo[]; modes: ModeInfo[] }) {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const onBoard = parts[0] === "board";
  const selected = onBoard ? resolveGame(games, parts[1]) : undefined;
  const selectedModes = selected ? modes.filter((m) => m.game_id === selected.game_id) : [];
  const selectedMode = selected ? resolveMode(selectedModes, parts[2]) : undefined;

  const allCurrent = onBoard && !selected;

  // keep the current cartridge in view inside the phone strip (horizontal scroll only)
  const strip = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const list = strip.current;
    const current = list?.querySelector<HTMLElement>("[aria-current]");
    if (!list || !current) return;
    const item = current.parentElement ?? current;
    list.scrollLeft = Math.max(0, item.offsetLeft - (list.clientWidth - item.offsetWidth) / 2);
  }, [pathname]);

  return (
    <>
      {/* phones and tablets: a compact strip of cartridges resting on one plank; the selected game's modes live in the board header */}
      <nav aria-label="Games" className="lg:hidden">
        <div className="rounded-window bg-plank p-2 shadow-window ring-2 ring-ink">
          <ul
            ref={strip}
            role="list"
            className="relative -m-1 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-1 p-1 [scrollbar-width:thin]"
          >
            <li className="shrink-0 snap-start">
              <Link
                href="/board"
                aria-current={allCurrent ? "page" : undefined}
                className={`flex h-full w-28 items-center gap-2 rounded-frame bg-wood-dark p-2 text-cream shadow-[0_3px_0_rgb(18_14_31/0.55)] ${
                  allCurrent ? "ring-2 ring-ember forced-colors:outline-2 forced-colors:outline-[Highlight]" : "ring-1 ring-ink"
                }`}
              >
                <span className="rounded-lg bg-ink/40 p-1">
                  <Sprite name="icon-board" />
                </span>
                <span className="font-display text-sm font-semibold leading-tight">All quests</span>
              </Link>
            </li>
            {games.map((g) => {
              const isSel = selected?.game_id === g.game_id;
              return (
                <li key={g.game_id} className="shrink-0 snap-start">
                  <Link
                    href={`/board/${g.slug}`}
                    aria-current={isSel && !selectedMode ? "page" : undefined}
                    className={`flex h-full w-36 items-center gap-2 rounded-frame bg-wood-dark p-2 text-cream shadow-[0_3px_0_rgb(18_14_31/0.55)] ${
                      isSel ? "ring-2 ring-ember forced-colors:outline-2 forced-colors:outline-[Highlight]" : "ring-1 ring-ink"
                    }`}
                  >
                    <span className="rounded-lg bg-ink/40 p-1">
                      <Sprite name={cartSprite(g.slug)} />
                    </span>
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span className="font-display text-sm font-semibold [overflow-wrap:anywhere]">{g.name}</span>
                      <span className={`text-xs font-semibold ${g.open_count > 0 ? "text-ember" : "text-lavender"}`}>
                        {g.open_count} open
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      <div className="hidden lg:block">
      <Window title="Game Shelf" titleAs="p" variant="wood" contentClassName="!px-3 !pb-3 !pt-7">
        <nav aria-label="Games">
          <ul
            role="list"
            className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-x-3 gap-y-1 pt-2 lg:grid-cols-1"
          >
            <li className="col-span-full pb-2">
              <Link
                href="/board"
                aria-current={onBoard && !selected ? "page" : undefined}
                className={`flex items-center gap-2 rounded-pill px-3 py-1.5 font-display text-sm font-semibold transition-colors hover:bg-wood-dark ${
                  onBoard && !selected ? "bg-ember text-ink forced-colors:outline-2 forced-colors:outline-[Highlight]" : "text-cream"
                }`}
              >
                <Sprite name="icon-board" />
                All quests
              </Link>
            </li>
            {games.map((g) => {
              const isSel = selected?.game_id === g.game_id;
              return (
                <li key={g.game_id} className="relative pb-4">
                  {/* the plank the cartridge rests on */}
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-[-4px] bottom-0 h-4 rounded-sm bg-plank-fine shadow-[0_3px_0_rgb(18_14_31/0.7)] ring-1 ring-ink"
                  />
                  <Link
                    href={`/board/${g.slug}`}
                    aria-current={isSel && !selectedMode ? "page" : undefined}
                    className={`relative flex items-center gap-3 rounded-frame bg-wood-dark p-2.5 text-cream shadow-[0_3px_0_rgb(18_14_31/0.55)] transition duration-150 hover:shadow-[0_5px_0_rgb(18_14_31/0.55),0_0_18px_rgb(242_166_90/0.35)] motion-safe:hover:-translate-y-0.5 ${
                      isSel ? "ring-2 ring-ember forced-colors:outline-2 forced-colors:outline-[Highlight]" : "ring-1 ring-ink"
                    }`}
                  >
                    <span className="rounded-lg bg-ink/40 p-1">
                      <Sprite name={cartSprite(g.slug)} />
                    </span>
                    <span className="flex min-w-0 flex-col items-start gap-1">
                      <span className="max-w-full font-display text-base font-semibold leading-tight [overflow-wrap:anywhere]">
                        {g.name}
                      </span>
                      <Chip tone={g.open_count > 0 ? "ember" : "parchment"}>{g.open_count} open</Chip>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {selected && selectedModes.length > 0 ? (
            <div className="mt-3 border-t border-ember/30 pt-3">
              <p className="mb-2 font-display text-sm font-semibold uppercase tracking-wider text-cream">
                {selected.name} modes
              </p>
              <ul role="list" className="flex flex-wrap gap-1.5">
                {selectedModes.map((m) => {
                  const isMode = selectedMode?.mode_id === m.mode_id;
                  return (
                    <li key={m.mode_id}>
                      <Link
                        href={`/board/${selected.slug}/${m.slug}`}
                        aria-current={isMode ? "page" : undefined}
                        className={`inline-block rounded-pill px-3 py-1 text-sm font-semibold transition motion-safe:hover:-translate-y-0.5 ${
                          isMode ? "bg-ember text-ink forced-colors:outline-2 forced-colors:outline-[Highlight]" : "bg-ink/50 text-cream hover:bg-ink/70"
                        }`}
                      >
                        {m.name}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </nav>
      </Window>
      </div>
    </>
  );
}
