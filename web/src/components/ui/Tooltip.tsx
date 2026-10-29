"use client";

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

export interface TooltipProps {
  /** Tooltip text. */
  content: ReactNode;
  side?: "top" | "bottom";
  className?: string;
  /** The trigger. It is wrapped in a focusable span so keyboard users can reach it. */
  children: ReactNode;
}

/**
 * CSS-driven tooltip: shows on hover and on keyboard focus within the trigger.
 * It stays open while the pointer is over the tip itself (no dead gap between
 * trigger and tip) and Escape dismisses it until the trigger is re-entered.
 */
export function Tooltip({ content, side = "top", className = "", children }: TooltipProps) {
  const id = useId();
  const [dismissed, setDismissed] = useState(false);
  const pos = side === "top" ? "bottom-full pb-2" : "top-full pt-2";

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") setDismissed(true);
  };
  const rearm = () => setDismissed(false);

  return (
    <span
      data-dismissed={dismissed ? "true" : "false"}
      onKeyDown={onKeyDown}
      onMouseLeave={rearm}
      onBlur={rearm}
      className={`group/tip relative inline-flex ${className}`}
    >
      <span aria-describedby={id} tabIndex={0} className="inline-flex rounded-md">
        {children}
      </span>
      {/* the padding on this wrapper bridges the gap so the tip can be hovered */}
      <span
        className={`absolute left-1/2 z-50 w-max max-w-64 -translate-x-1/2 ${pos} invisible opacity-0 transition duration-150 group-hover/tip:visible group-hover/tip:opacity-100 group-focus-within/tip:visible group-focus-within/tip:opacity-100 group-data-[dismissed=true]/tip:!invisible group-data-[dismissed=true]/tip:!opacity-0`}
      >
        <span
          id={id}
          role="tooltip"
          className="block rounded-chip border-2 border-ink bg-parchment px-2.5 py-1 text-center text-sm font-semibold text-ink shadow-window"
        >
          {content}
        </span>
      </span>
    </span>
  );
}
