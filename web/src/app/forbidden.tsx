import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, Sprite, Window } from "@/components/ui";

export const metadata: Metadata = { title: "Door locked | PairADice" };

/** Rendered by forbidden() (signed in, but missing the role or permission). Root-level, so it brings its own header. */
export default function Forbidden() {
  return (
    <>
      <header className="border-b-4 border-ink bg-dusk">
        <div className="mx-auto flex max-w-[1680px] items-center px-4 py-2">
          <Link href="/hearth" className="flex items-center gap-2.5 rounded-chip py-1">
            <Sprite name="dice-32" scale={1} alt="" />
            <span className="font-display text-xl font-bold tracking-wide text-cream [text-shadow:0_2px_0_var(--color-ink)]">
              PairADice
            </span>
          </Link>
        </div>
      </header>
      <main id="main" className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-10">
        <Window title="403" titleAs="p" className="w-full">
          <div className="flex flex-col items-center gap-4 text-center">
            <Sprite name="icon-lock" scale={4} />
            <h1 className="font-display text-2xl font-bold [text-shadow:0_2px_0_var(--color-ink)]">
              This door is locked
            </h1>
            <p className="text-lavender">
              Your account does not hold the key for this room. If you think it should, ask a guild moderator.
            </p>
            <ButtonLink href="/hearth" variant="yellow" size="sm">
              Back to the Hearth
            </ButtonLink>
          </div>
        </Window>
      </main>
    </>
  );
}
