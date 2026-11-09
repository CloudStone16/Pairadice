"use client";

import { useEffect, useRef, type RefObject } from "react";
import { Sprite } from "@/components/ui";
import type { AuthField, AuthFormState } from "@/lib/auth/form-state";

/** After a failed submit, move focus to the error summary (which links to each invalid field). */
export function useFocusOnError(state: AuthFormState): {
  formRef: RefObject<HTMLFormElement | null>;
  summaryRef: RefObject<HTMLDivElement | null>;
} {
  const formRef = useRef<HTMLFormElement | null>(null);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (state.status !== "error") return;
    summaryRef.current?.focus();
  }, [state]);
  return { formRef, summaryRef };
}

export function ErrorSummary({
  state,
  summaryRef,
  fieldIds = {},
}: {
  state: AuthFormState;
  summaryRef: RefObject<HTMLDivElement | null>;
  /** Maps a field name to its input id, so each error can link to its field. */
  fieldIds?: Partial<Record<AuthField, string>>;
}) {
  if (state.status !== "error") return null;
  const links = (Object.entries(state.fieldErrors ?? {}) as [AuthField, string | undefined][]).filter(
    (e): e is [AuthField, string] => Boolean(e[1] && fieldIds[e[0]]),
  );
  return (
    <div
      ref={summaryRef}
      tabIndex={-1}
      aria-labelledby="form-error-title"
      className="rounded-chip border-2 border-[#8f2a26] bg-[#fdeceb] p-3 text-[0.9375rem] text-[#6e1d1a]"
    >
      <h2 id="form-error-title" className="flex items-center gap-2 font-display text-base font-bold">
        <Sprite name="icon-warning" scale={2} />
        There&apos;s a problem
      </h2>
      <p className="mt-1 font-bold">{state.message}</p>
      {links.length > 0 ? (
        <ul className="mt-1 list-disc pl-6">
          {links.map(([field, msg]) => (
            <li key={field}>
              <a href={`#${fieldIds[field]}`} className="font-bold underline underline-offset-2">
                {msg}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-[0.9375rem] text-wood-dark" aria-hidden="true">
      <span className="h-px flex-1 bg-wood/50" />
      or
      <span className="h-px flex-1 bg-wood/50" />
    </div>
  );
}
