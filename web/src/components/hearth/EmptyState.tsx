import type { ReactNode } from "react";
import { Sprite } from "@/components/ui";
import type { SpriteName } from "@/lib/sprite-names";

const MASCOTS = {
  sleep: "mascot-cat-sleep",
  wave: "mascot-cat-wave",
  sad: "mascot-cat-sad",
} as const satisfies Record<string, SpriteName>;

/** A cozy "nothing here yet" panel with a little sprite for personality. */
export function EmptyState({
  title,
  children,
  sprite = "deco-moon",
  mascot = "sleep",
  tone = "dark",
  action,
  as: Heading = "h3",
}: {
  title: string;
  children?: ReactNode;
  sprite?: SpriteName;
  /** Mascot pose shown above the title; pass false to show `sprite` instead. */
  mascot?: "sleep" | "wave" | "sad" | false;
  tone?: "dark" | "light";
  action?: ReactNode;
  as?: "h1" | "h2" | "h3";
}) {
  const palette =
    tone === "light"
      ? "border-wood/50 bg-parchment/60 text-ink"
      : "border-lavender/40 bg-ink/30 text-cream";
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-window border-2 border-dashed px-6 py-10 text-center ${palette}`}
    >
      <Sprite
        name={mascot ? MASCOTS[mascot] : sprite}
        scale={mascot ? 2 : 3}
        className="motion-safe:animate-float"
      />
      <Heading className="font-display text-xl font-semibold [overflow-wrap:anywhere]">{title}</Heading>
      {children ? <p className="max-w-md text-sm opacity-90">{children}</p> : null}
      {action}
    </div>
  );
}
