import type { ReactNode } from "react";
import { Sprite } from "@/components/ui";

/** "Press Start" title screen: dusk sky, logo, blinking cursor, then the form window. */
export function TitleScreen({ tagline, children }: { tagline: string; children: ReactNode }) {
  return (
    <div className="relative flex flex-1 flex-col overflow-x-clip">
      {/* sky decoration, purely visual */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <Sprite name="deco-moon" scale={4} className="absolute right-[8%] top-[6%] opacity-95" />
        <Sprite name="deco-star" scale={2} className="absolute left-[10%] top-[8%] motion-safe:animate-flicker" />
        <Sprite name="deco-star" scale={1} className="absolute left-[30%] top-[18%] opacity-80" />
        <Sprite name="deco-star" scale={2} className="absolute right-[28%] top-[14%] opacity-90" />
        <Sprite name="deco-star" scale={1} className="absolute left-[78%] top-[34%] opacity-70" />
        <Sprite name="deco-star" scale={1} className="absolute left-[6%] top-[42%] opacity-70" />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-ember/15 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-3 bg-plank-fine border-t-4 border-ink" />
      </div>

      <main id="main" className="relative mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-6 px-4 pb-16 pt-10 sm:pt-14">
        <header className="flex flex-col items-center gap-2 text-center">
          <Sprite name="mascot-cat" scale={4} className="motion-safe:animate-float" />
          <p className="font-display text-4xl font-bold tracking-wide text-cream [text-shadow:0_3px_0_var(--color-ink)] sm:text-5xl">
            PairADice
          </p>
          <p className="flex items-center gap-2 font-display text-lg font-semibold text-ember">
            <span aria-hidden="true" className="inline-block motion-safe:animate-blink">
              <Sprite name="icon-press-start" scale={2} />
            </span>
            {tagline}
          </p>
        </header>
        {children}
      </main>
    </div>
  );
}
