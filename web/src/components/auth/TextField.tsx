import type { ReactNode } from "react";
import { Sprite } from "@/components/ui";
import type { SpriteName } from "@/lib/sprite-names";

export interface TextFieldProps {
  id: string;
  name: string;
  label: string;
  icon: SpriteName;
  type?: "text" | "email";
  autoComplete: string;
  defaultValue?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  maxLength?: number;
  /** Extra control placed inside the field, at the right edge (e.g. the show/hide toggle). */
  trailing?: ReactNode;
  /** Replaces the default input (used by the password field to control `type`). */
  inputType?: string;
}

export const inputClasses =
  "w-full min-h-11 rounded-chip border-2 border-ink bg-[#fbf5e6] py-2 pl-11 text-base text-ink shadow-[inset_0_2px_0_rgb(18_14_31/0.12)] placeholder:text-wood-dark aria-invalid:border-[#8a2621] aria-invalid:bg-[#fff1ec]";

/** Labelled input with an icon, an optional hint and an error that is linked by aria-describedby. */
export function TextField({
  id,
  name,
  label,
  icon,
  type = "text",
  inputType,
  autoComplete,
  defaultValue,
  error,
  hint,
  required = true,
  maxLength,
  trailing,
}: TextFieldProps) {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block font-display text-base font-semibold text-ink">
        {label}
      </label>
      <div className="relative">
        <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
          <Sprite name={icon} />
        </span>
        <input
          id={id}
          name={name}
          type={inputType ?? type}
          autoComplete={autoComplete}
          defaultValue={defaultValue}
          required={required}
          maxLength={maxLength}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          autoCapitalize="none"
          spellCheck={false}
          className={`${inputClasses} ${trailing ? "pr-14" : "pr-3"}`}
        />
        {trailing ? <div className="absolute right-1.5 top-1/2 -translate-y-1/2">{trailing}</div> : null}
      </div>
      {hint ? (
        <p id={hintId} className="mt-1 text-[15px] text-wood-dark">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1 flex items-start gap-1.5 text-[15px] font-semibold text-[#8a2621]">
          <Sprite name="icon-warning" className="mt-0.5" />
          <span>
            <span className="sr-only">Error: </span>
            {error}
          </span>
        </p>
      ) : null}
    </div>
  );
}
