"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import type { CampActionState } from "@/app/(hearth)/camp/[sessionId]/actions";
import { FormAlert } from "@/components/auth/FormAlert";
import { Button, PendingButton, Sprite, type ButtonVariant } from "@/components/ui";
import type { SpriteName } from "@/lib/sprite-names";
import { useCampRegion, withCampResult } from "./CampStatus";

export interface ActionControlProps {
  action: (prev: CampActionState, fd: FormData) => Promise<CampActionState>;
  /** Hidden form fields (ids, never secrets). */
  fields: Record<string, string | number>;
  label: string;
  /** Accessible name when the visible label alone is ambiguous, e.g. "Accept priya_gg". */
  accessibleName?: string;
  icon?: SpriteName;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  /** When set, the first click opens a keyboard-operable confirm step. */
  confirm?: { prompt: string; yes: string; no?: string };
  /** Colour scheme of the surface the control sits on, for message text. */
  surface?: "dark" | "light";
}

/**
 * One server action as a button. While pending it is aria-disabled (it keeps focus) and the pending
 * label is announced; a failure shows the database's message in an alert region beside the control; a
 * success goes to the CampStatusRegion that stays mounted when this control disappears.
 */
export function ActionControl({
  action,
  fields,
  label,
  accessibleName,
  icon,
  variant = "yellow",
  size = "md",
  confirm,
  surface = "dark",
}: ActionControlProps) {
  const wrapped = useMemo(() => withCampResult(action), [action]);
  const [state, formAction, pending] = useActionState(wrapped, null);
  // the confirm step is open from the click until the action reports back (the state object changes)
  const [askedAt, setAskedAt] = useState<{ at: CampActionState } | null>(null);
  const asking = askedAt !== null && askedAt.at === state;
  const setAsking = (open: boolean) => setAskedAt(open ? { at: state } : null);
  const box = useRef<HTMLDivElement>(null);
  const hasRegion = useCampRegion();
  const wasAsking = useRef(false);

  // focus the safe choice when the confirm step opens, and return focus when it is dismissed
  useEffect(() => {
    if (asking) box.current?.querySelector<HTMLElement>("[data-no]")?.focus();
    else if (wasAsking.current) box.current?.querySelector<HTMLElement>("[data-trigger]")?.focus();
    wasAsking.current = asking;
  }, [asking]);

  const hidden = Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={String(v)} />);
  const name = accessibleName ?? label;
  const msgTone = surface === "light" ? "text-wood-dark" : "text-lavender";

  return (
    <div ref={box} className="flex flex-col gap-2">
      {confirm && asking ? (
        <form
          action={formAction}
          role="group"
          aria-label={`Confirm: ${name}`}
          onKeyDown={(e) => {
            if (e.key === "Escape") setAsking(false);
          }}
          className="flex flex-col gap-2 rounded-frame border-2 border-dashed border-current p-3"
        >
          {hidden}
          <p className="text-sm font-semibold">{confirm.prompt}</p>
          <div className="flex flex-wrap gap-2">
            <PendingButton
              type="submit"
              variant="red"
              size="sm"
              pending={pending}
              pendingLabel={`Working on ${name}`}
              aria-label={`${confirm.yes}: ${name}`}
            >
              {confirm.yes}
            </PendingButton>
            <Button
              data-no=""
              type="button"
              variant="ghost"
              size="sm"
              aria-disabled={pending ? true : undefined}
              onClick={() => {
                if (!pending) setAsking(false);
              }}
            >
              {confirm.no ?? "Never mind"}
            </Button>
          </div>
        </form>
      ) : (
        <form action={confirm ? undefined : formAction} onSubmit={confirm ? (e) => e.preventDefault() : undefined}>
          {hidden}
          <PendingButton
            data-trigger=""
            type={confirm ? "button" : "submit"}
            variant={variant}
            size={size}
            pending={pending}
            pendingLabel={`Working on ${name}`}
            aria-label={name === label ? undefined : name}
            onClick={confirm ? () => setAsking(true) : undefined}
          >
            {icon ? <Sprite name={icon} /> : null}
            {label}
          </PendingButton>
        </form>
      )}
      <FormAlert message={state && !state.ok ? state.message : undefined} />
      {hasRegion ? null : (
        <p role="status" className={`text-sm ${msgTone} ${state?.ok ? "" : "sr-only"}`}>
          {state?.ok ? state.message : ""}
        </p>
      )}
    </div>
  );
}
