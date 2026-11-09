"use client";

import type { MouseEvent } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

export function SubmitButton({ children, pendingLabel = "Starting…" }: { children: string; pendingLabel?: string }) {
  const { pending } = useFormStatus();
  // aria-disabled (not disabled) keeps keyboard focus on the button while the request runs
  const ignoreWhilePending = (e: MouseEvent<HTMLButtonElement>) => {
    if (pending) e.preventDefault();
  };
  return (
    <>
      <Button
        type="submit"
        variant="yellow"
        aria-disabled={pending ? "true" : undefined}
        onClick={ignoreWhilePending}
        className="w-full"
      >
        {pending ? pendingLabel : children}
      </Button>
      <p role="status" className="sr-only">
        {pending ? pendingLabel : ""}
      </p>
    </>
  );
}
