import type { Metadata } from "next";
import Link from "next/link";
import { NotFoundPanel } from "@/components/hearth/NotFoundPanel";
import { Sprite } from "@/components/ui";

export const metadata: Metadata = { title: "Page not found | PairADice" };

/** Outside the hearth layout there is no HUD, so this carries a minimal brand header of its own. */
export default function RootNotFound() {
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
      <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-4">
        <div className="w-full">
          <NotFoundPanel
            title="You wandered off the map"
            message="There is no such path through the woods."
            href="/hearth"
            cta="Back to the Hearth"
          />
        </div>
      </main>
    </>
  );
}
