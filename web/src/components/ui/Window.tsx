import { useId, type ReactNode } from "react";

export type WindowVariant = "plum" | "parchment" | "wood";

export interface WindowProps {
  title?: ReactNode;
  /**
   * Element used for the title plaque. Default h2. Use "p" when the window
   * itself contains the page h1 (so no h2 precedes it) or sits before it.
   */
  titleAs?: "h2" | "h3" | "p";
  variant?: WindowVariant;
  /**
   * Expose the window as a named region landmark. Only for major page
   * sections; small panels stay plain containers.
   */
  landmark?: boolean;
  /** Warm ember halo around the window (the campfire). */
  glow?: boolean;
  className?: string;
  /** Extra classes for the padded content area. */
  contentClassName?: string;
  children?: ReactNode;
}

const inner: Record<WindowVariant, string> = {
  plum: "bg-plum text-cream ring-1 ring-inset ring-lavender/60",
  // ink focus ring keeps >= 3:1 on parchment
  parchment: "bg-parchment text-ink ring-1 ring-inset ring-wood/60 [--focus-ring:var(--color-ink)]",
  wood: "bg-wood text-cream ring-1 ring-inset ring-ember/60",
};

const plaque: Record<WindowVariant, string> = {
  plum: "bg-plum-2 text-cream border-ink ring-1 ring-inset ring-lavender/60 [text-shadow:0_2px_0_var(--color-ink)]",
  parchment: "bg-parchment-dark text-ink border-ink ring-1 ring-inset ring-wood/60 [--focus-ring:var(--color-ink)]",
  wood: "bg-wood-dark text-cream border-ink ring-1 ring-inset ring-ember/60 [text-shadow:0_2px_0_var(--color-ink)]",
};

export function Window({
  title,
  titleAs: Title = "h2",
  variant = "plum",
  landmark = false,
  glow = false,
  className = "",
  contentClassName = "",
  children,
}: WindowProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={landmark && title ? titleId : undefined}
      className={`relative flex flex-col rounded-window bg-ink p-[3px] forced-colors:border-2 forced-colors:border-[CanvasText] ${
        glow ? "shadow-glow" : "shadow-window"
      } ${className}`}
    >
      <div className={`relative flex flex-1 flex-col rounded-[11px] shadow-bevel ${inner[variant]}`}>
        {title ? (
          <Title
            id={titleId}
            className={`absolute -top-[15px] left-5 z-10 rounded-chip border-2 px-3.5 py-0.5 font-display text-base font-semibold tracking-wide ${plaque[variant]}`}
          >
            {title}
          </Title>
        ) : null}
        <div className={`flex-1 p-4 sm:p-5 ${title ? "pt-7 sm:pt-8" : ""} ${contentClassName}`}>
          {children}
        </div>
      </div>
    </section>
  );
}
