"use client";

import type { MouseEvent } from "react";
import { Button, type ButtonProps } from "./Button";

export interface PendingButtonProps extends Omit<ButtonProps, "disabled"> {
  pending: boolean;
  /** Announced politely when the action starts ("Opening the door"). Not shown. */
  pendingLabel: string;
}

/**
 * A button that stays focusable while its action runs: `disabled` would drop keyboard focus, so it is
 * aria-disabled instead, clicks and implicit submits are ignored while pending, and the pending label
 * is announced from a visually hidden polite status that is always mounted.
 */
export function PendingButton({ pending, pendingLabel, onClick, children, ...rest }: PendingButtonProps) {
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    if (pending) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };
  return (
    <>
      <Button {...rest} aria-disabled={pending ? true : undefined} aria-busy={pending ? true : undefined} onClick={handleClick}>
        {children}
      </Button>
      <span role="status" className="sr-only">
        {pending ? pendingLabel : ""}
      </span>
    </>
  );
}
