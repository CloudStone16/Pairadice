"use client";

import { useEffect, useId, useRef } from "react";
import { Sprite } from "@/components/ui";
import type { AuthFormState } from "@/lib/auth/form-state";

export interface FormAlertItem {
  /** Id of the invalid field; the link focuses it. */
  id: string;
  text: string;
}

const AUTH_FIELD_ORDER = ["username", "displayName", "email", "password"] as const;

/** In-page links for each invalid auth field (the hidden timezone field has no control to link to). */
export function authErrorItems(fieldErrors: AuthFormState["fieldErrors"]): FormAlertItem[] {
  if (!fieldErrors) return [];
  const items: FormAlertItem[] = [];
  for (const id of AUTH_FIELD_ORDER) {
    const text = fieldErrors[id];
    if (text) items.push({ id, text });
  }
  return items;
}

/**
 * Error summary. Two modes, never both on one element:
 * - with `focusKey` (forms): a focusable region with a "There's a problem" heading and links to each invalid
 *   field; focus moves to it whenever `focusKey` changes and there is something to show. No live role, because
 *   the focus move is the announcement.
 * - without it (status messages beside a control): a plain role="alert" that stays mounted.
 */
export function FormAlert({
  message,
  items,
  focusKey,
}: {
  message?: string;
  items?: FormAlertItem[];
  focusKey?: unknown;
}) {
  const headingId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const hasContent = Boolean(message) || (items?.length ?? 0) > 0;
  const focusable = focusKey !== undefined;

  useEffect(() => {
    if (focusable && hasContent) ref.current?.focus();
  }, [focusKey, focusable, hasContent]);

  const body = hasContent ? (
    <div className="rounded-frame border-2 border-[#8a2621] bg-[#fff1ec] p-3 text-[15px] text-[#6e1c18]">
      {focusable ? (
        <h2 id={headingId} className="mb-1 flex items-center gap-2 font-display text-lg font-bold">
          <Sprite name="icon-warning" />
          There&apos;s a problem
        </h2>
      ) : null}
      {message ? (
        <p className="flex items-start gap-2 font-semibold">
          {focusable ? null : <Sprite name="icon-warning" className="mt-0.5" />}
          <span>{message}</span>
        </p>
      ) : null}
      {items && items.length > 0 ? (
        <ul role="list" className="mt-2 list-disc pl-6">
          {items.map((it) => (
            <li key={it.id}>
              <a
                href={`#${it.id}`}
                onClick={(e) => {
                  const el = document.getElementById(it.id);
                  if (el) {
                    e.preventDefault();
                    el.focus();
                  }
                }}
                className="font-semibold underline underline-offset-2"
              >
                {it.text}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  ) : null;

  if (focusable) {
    return (
      <div ref={ref} role="group" tabIndex={-1} aria-labelledby={hasContent ? headingId : undefined} className={hasContent ? "" : "hidden"}>
        {body}
      </div>
    );
  }
  return (
    <div role="alert" className={hasContent ? "" : "hidden"}>
      {body}
    </div>
  );
}
