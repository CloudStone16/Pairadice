import type { ReactNode } from "react";

export type ChipTone =
  | "lavender"
  | "ember"
  | "green"
  | "blue"
  | "red"
  | "yellow"
  | "parchment";

const tones: Record<ChipTone, string> = {
  lavender: "bg-lavender text-ink",
  ember: "bg-ember text-ink",
  green: "bg-sfc-green text-ink",
  blue: "bg-sfc-blue text-ink",
  red: "bg-sfc-red text-ink",
  yellow: "bg-sfc-yellow text-ink",
  parchment: "bg-parchment text-ink",
};

export interface ChipProps {
  tone?: ChipTone;
  /** Optional leading icon, e.g. a <Sprite />. */
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function Chip({ tone = "lavender", icon, className = "", children }: ChipProps) {
  return (
    <span
      className={`inline-flex max-w-full items-start gap-1.5 rounded-chip px-2.5 py-0.5 font-display text-sm font-medium leading-6 [overflow-wrap:anywhere] forced-colors:border forced-colors:border-[CanvasText] shadow-[0_2px_0_rgb(18_14_31/0.5),inset_0_1px_0_rgb(255_255_255/0.35)] ${tones[tone]} ${className}`}
    >
      {icon ? <span className="inline-flex h-6 shrink-0 items-center">{icon}</span> : null}
      {children}
    </span>
  );
}
