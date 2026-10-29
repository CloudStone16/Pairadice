import type { ReactNode } from "react";
import { Sprite } from "@/components/ui";
import type { SpriteName } from "@/lib/sprite-names";

/** A cozy "nothing here yet" panel with a little sprite for personality. */
export function EmptyState({
  title,
  children,
  sprite = "deco-moon",
  tone = "dark",
  action,
  as: Heading = "h3",
}: {
  title: string;
  children?: ReactNode;
  sprite?: SpriteName;
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
      <Sprite name={sprite} scale={3} className="motion-safe:animate-float" />
      <Heading className="font-display text-xl font-semibold [overflow-wrap:anywhere]">{title}</Heading>
      {children ? <p className="max-w-md text-sm opacity-90">{children}</p> : null}
      {action}
    </div>
  );
}
