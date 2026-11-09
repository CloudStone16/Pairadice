import { Sprite } from "@/components/ui";
import styles from "./auth.module.css";

const STARS: ReadonlyArray<{ cls: string; delay: string }> = [
  { cls: "left-[8%] top-[10%]", delay: "0s" },
  { cls: "left-[22%] top-[34%] hidden sm:block", delay: "1.2s" },
  { cls: "right-[12%] top-[26%]", delay: "0.6s" },
  { cls: "right-[28%] top-[8%] hidden sm:block", delay: "2s" },
  { cls: "left-[14%] bottom-[22%] hidden md:block", delay: "1.7s" },
  { cls: "right-[9%] bottom-[18%]", delay: "0.3s" },
];

/** Decorative night sky: moon and twinkling stars. Purely aria-hidden. */
export function NightSky() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-night via-dusk to-plum" />
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-[radial-gradient(ellipse_70%_100%_at_50%_100%,rgb(242_166_90/0.18),transparent_70%)]" />
      <Sprite name="deco-moon" scale={4} className="absolute right-[6%] top-[5%] hidden opacity-90 sm:block" />
      {STARS.map((s) => (
        <span
          key={s.cls}
          className={`absolute ${s.cls} ${styles.twinkle}`}
          style={{ animationDelay: s.delay }}
        >
          <Sprite name="deco-star" scale={2} />
        </span>
      ))}
    </div>
  );
}

// the visible "heading" is a decorative arcade prompt; the h1 names the page
const PAGE_TITLES: Readonly<Record<string, string>> = {
  "Press Start": "Sign in",
  "New Game": "Create a character",
};

export function TitleHeader({ heading, tagline = true }: { heading: string; tagline?: boolean }) {
  const title = PAGE_TITLES[heading] ?? heading;
  return (
    <header className="flex flex-col items-center text-center">
      <Sprite name="logo-title-32" scale={4} />
      <p className="mt-2 font-display text-4xl font-bold tracking-wide text-cream [text-shadow:0_3px_0_var(--color-ink)] sm:text-5xl">
        PairADice
      </p>
      {tagline ? (
        <p className="mt-1 max-w-xs text-base text-lavender">
          Find your party. Pull up a seat by the fire.
        </p>
      ) : null}
      <p
        aria-hidden="true"
        className="mt-5 flex items-center gap-2 font-display text-lg font-semibold uppercase tracking-widest text-sfc-yellow [text-shadow:0_2px_0_var(--color-ink)]"
      >
        <span className={styles.blink}>
          <Sprite name="icon-press-start" scale={2} />
        </span>
        {heading}
      </p>
      <h1 className="mt-1 font-display text-2xl font-semibold tracking-wide text-cream [text-shadow:0_2px_0_var(--color-ink)]">
        {title}
      </h1>
    </header>
  );
}
