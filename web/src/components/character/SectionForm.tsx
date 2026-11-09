"use client";

import { useActionState, useState, type ReactNode } from "react";
import { FormAlert } from "@/components/auth/FormAlert";
import { PendingButton, Sprite, type ButtonVariant } from "@/components/ui";
import type { SpriteName } from "@/lib/sprite-names";
import { INITIAL_PROFILE_STATE, type ProfileFormState } from "@/lib/profile/types";

/** Read helpers over the values a failed submit echoed back (empty after a success, so fresh data wins). */
export interface SectionCtx {
  fe: Record<string, string>;
  /** True when a failed submit echoed values, so fields should refill from them. */
  refill: boolean;
  str: (key: string, fallback?: string) => string;
  list: (key: string, fallback?: string[]) => string[];
}

function buildCtx(state: ProfileFormState): SectionCtx {
  const refill = state.status === "error" && state.values !== undefined;
  const raw = refill ? (state.values ?? {}) : {};
  return {
    fe: state.fieldErrors ?? {},
    refill,
    str(key, fallback = "") {
      const v = raw[key];
      if (v === undefined) return fallback;
      return Array.isArray(v) ? (v[0] ?? fallback) : v;
    },
    list(key, fallback = []) {
      const v = raw[key];
      if (v === undefined) return refill ? [] : fallback;
      return Array.isArray(v) ? v : [v];
    },
  };
}

/**
 * One editor section: a form wired to a server action, an error summary that takes focus, a polite
 * "Saved." line, and a submit button. The fields are remounted after every response so their defaults
 * (React resets uncontrolled forms after an action) match the submitted or freshly saved data.
 * Field ids are `${prefix}-${fieldName}` so error links land on the right control.
 */
export function SectionForm({
  action,
  prefix,
  dataKey,
  submitLabel,
  submitAriaLabel,
  pendingLabel,
  headingLevel = 3,
  submitIcon = "icon-save",
  submitVariant = "green",
  hidden,
  children,
}: {
  action: (prev: ProfileFormState, formData: FormData) => Promise<ProfileFormState>;
  prefix: string;
  /** Changes when the saved data changes, to refresh field defaults. */
  dataKey: string;
  submitLabel: string;
  /** Longer name for repeated buttons; must start with the visible label. */
  submitAriaLabel?: string;
  /** Level of the error summary heading, by where the form sits in the page. */
  headingLevel?: 3 | 4;
  pendingLabel: string;
  submitIcon?: SpriteName;
  submitVariant?: ButtonVariant;
  hidden?: ReactNode;
  children: (ctx: SectionCtx) => ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_PROFILE_STATE);
  const [seen, setSeen] = useState(state);
  const [version, setVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  if (seen !== state) {
    setSeen(state);
    setVersion((v) => v + 1);
    setDirty(false);
  }
  const ctx = buildCtx(state);
  const items = Object.entries(ctx.fe).map(([k, text]) => ({ id: `${prefix}-${k}`, text }));

  return (
    <form action={formAction} noValidate onChange={() => setDirty(true)} onInput={() => setDirty(true)} className="flex flex-col gap-5">
      {hidden}
      <FormAlert
        message={state.status === "error" ? (state.message ?? "That did not save. Please check the form and try again.") : undefined}
        items={items}
        focusKey={state}
        headingLevel={headingLevel}
      />
      <div key={`${version}:${dataKey}`} className="flex flex-col gap-5">
        {children(ctx)}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <PendingButton type="submit" aria-label={submitAriaLabel} variant={submitVariant} pending={pending} pendingLabel={pendingLabel}>
          <Sprite name={submitIcon} />
          {submitLabel}
        </PendingButton>
        <p role="status" className="flex items-center gap-1.5 text-base font-semibold text-[#1f5a2c]">
          {state.status === "saved" && !dirty ? (
            <>
              <Sprite name="icon-check" />
              <span>{state.message ?? "Saved."}</span>
            </>
          ) : null}
        </p>
      </div>
    </form>
  );
}
