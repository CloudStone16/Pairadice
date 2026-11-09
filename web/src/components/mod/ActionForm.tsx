"use client";

import { useActionState, useState, type ReactNode } from "react";
import { FormAlert } from "@/components/auth/FormAlert";
import { PendingButton, Sprite, type ButtonVariant } from "@/components/ui";
import type { SpriteName } from "@/lib/sprite-names";
import { INITIAL_MOD_STATE, type ModFormState } from "@/lib/moderation/types";

export interface ActionFormCtx {
  /** Field errors by field name. */
  fe: Record<string, string>;
  /** Value to show in a field: what a failed submit echoed back, else the fallback. */
  str: (key: string, fallback?: string) => string;
  /** `${id}-${field}`: the id to give the control, so the error summary can focus it. */
  fid: (field: string) => string;
}

export type ModAction = (prev: ModFormState, formData: FormData) => Promise<ModFormState>;

/**
 * One small moderation form wired to a server action. It works without JavaScript (a plain POST). Shows an
 * error summary that takes focus, a polite status line for results, and, when the action answers that
 * confirmation is needed (fieldErrors.confirm), swaps the submit for a red confirm button that posts
 * confirm=yes together with the same fields.
 */
export function ActionForm({
  action,
  id,
  submitLabel,
  confirmLabel,
  buttonName,
  pendingLabel,
  icon,
  variant = "yellow",
  size = "md",
  surface = "parchment",
  hidden,
  children,
}: {
  action: ModAction;
  id: string;
  submitLabel: string;
  confirmLabel?: string;
  /** Longer accessible name for repeated buttons; must start with the visible label. */
  buttonName?: string;
  pendingLabel: string;
  icon: SpriteName;
  variant?: ButtonVariant;
  size?: "sm" | "md";
  /** Where the form sits: decides the colour of the status line. */
  surface?: "parchment" | "plum";
  hidden?: ReactNode;
  children?: (ctx: ActionFormCtx) => ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_MOD_STATE);
  const [seen, setSeen] = useState(state);
  const [version, setVersion] = useState(0);
  if (seen !== state) {
    setSeen(state);
    setVersion((v) => v + 1);
  }
  const confirming = state.status === "error" && state.fieldErrors?.confirm !== undefined;
  const fe = Object.fromEntries(Object.entries(state.fieldErrors ?? {}).filter(([k]) => k !== "confirm"));
  const items = Object.entries(fe).map(([k, text]) => ({ id: `${id}-${k}`, text }));
  const values = state.status === "error" ? (state.values ?? {}) : {};
  const ctx: ActionFormCtx = {
    fe,
    str: (key, fallback = "") => values[key] ?? fallback,
    fid: (field) => `${id}-${field}`,
  };

  return (
    <form action={formAction} noValidate className="flex flex-col gap-3">
      {hidden}
      <FormAlert
        message={state.status === "error" && !confirming ? state.message : undefined}
        items={items}
        focusKey={state}
        headingLevel={4}
      />
      <div key={version} className="flex flex-col gap-3">
        {children?.(ctx)}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {confirming && confirmLabel ? (
          // the submit button it replaces had focus: keep keyboard users on the decision
          <PendingButton autoFocus type="submit" name="confirm" value="yes" size={size} variant="red" pending={pending} pendingLabel={pendingLabel}>
            <Sprite name="icon-warning" />
            {confirmLabel}
          </PendingButton>
        ) : (
          <PendingButton type="submit" aria-label={buttonName} size={size} variant={variant} pending={pending} pendingLabel={pendingLabel}>
            <Sprite name={icon} />
            {submitLabel}
          </PendingButton>
        )}
      </div>
      <p
        role="status"
        className={`flex items-start gap-1.5 text-[15px] font-semibold ${
          surface === "plum"
            ? confirming
              ? "text-[#ffb4ad]"
              : "text-sfc-green"
            : confirming
              ? "text-[#8a2621]"
              : "text-[#1f5a2c]"
        }`}
      >
        {confirming ? (
          <>
            <Sprite name="icon-warning" className="mt-0.5" />
            <span>{state.message}</span>
          </>
        ) : state.status === "saved" ? (
          <>
            <Sprite name="icon-check" className="mt-0.5" />
            <span>{state.message ?? "Done."}</span>
          </>
        ) : null}
      </p>
    </form>
  );
}
