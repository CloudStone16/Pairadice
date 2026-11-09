import type { ReactNode } from "react";
import { Sprite } from "@/components/ui";
import type { SpriteName } from "@/lib/sprite-names";

export const inputClasses =
  "block w-full min-h-11 rounded-chip border-2 border-wood-dark bg-[#fbf5e4] px-3 py-2 text-base text-ink " +
  "aria-invalid:border-[#8f2a26] aria-invalid:bg-[#fdeceb] focus-visible:outline-3 focus-visible:outline-offset-1";

export interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  icon?: SpriteName;
  /** The control; receives aria attributes via the helper below. */
  children: (aria: { "aria-invalid": true | undefined; "aria-describedby": string | undefined }) => ReactNode;
}

export function Field({ id, label, hint, error, icon, children }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="flex items-center gap-2 font-display text-base font-semibold">
        {icon ? <Sprite name={icon} scale={1} /> : null}
        {label}
      </label>
      {children({ "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint ? (
        <p id={hintId} className="text-[0.9375rem] leading-snug text-wood-dark">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errId} className="text-[0.9375rem] font-bold leading-snug text-[#8f2a26]">
          <span className="sr-only">Error: </span>
          {error}
        </p>
      ) : null}
    </div>
  );
}
