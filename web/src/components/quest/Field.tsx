import type { ReactNode } from "react";
import { Sprite } from "@/components/ui";

export const controlClasses =
  "w-full min-h-11 rounded-chip border-2 border-ink bg-[#fbf5e6] px-3 py-2 text-base text-ink shadow-[inset_0_2px_0_rgb(18_14_31/0.12)] placeholder:text-wood-dark aria-invalid:border-[#8a2621] aria-invalid:bg-[#fff1ec]";

/** aria props that tie a control to its hint and error text (ids built by Field). */
export function ariaFor(id: string, opts: { hint?: string; error?: string }) {
  const ids = [opts.hint ? `${id}-hint` : null, opts.error ? `${id}-error` : null].filter(Boolean).join(" ");
  return { "aria-invalid": opts.error ? (true as const) : undefined, "aria-describedby": ids || undefined };
}

export function FieldHint({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={`${id}-hint`} className="mt-1 text-[15px] text-wood-dark">
      {children}
    </p>
  );
}

export function FieldError({ id, error }: { id: string; error?: string }) {
  if (!error) return null;
  return (
    <p id={`${id}-error`} className="mt-1 flex items-start gap-1.5 text-[15px] font-semibold text-[#8a2621]">
      <Sprite name="icon-warning" className="mt-0.5" />
      <span>
        <span className="sr-only">Error: </span>
        {error}
      </span>
    </p>
  );
}

/** Label + control slot + hint + error. The control gets its aria props from ariaFor(). */
export function Field({
  id,
  label,
  hint,
  error,
  children,
  optional,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block font-display text-base font-semibold text-ink">
        {label}
        {optional ? <span className="font-sans text-[15px] font-normal text-wood-dark"> (optional)</span> : null}
      </label>
      {children}
      {hint ? <FieldHint id={id}>{hint}</FieldHint> : null}
      <FieldError id={id} error={error} />
    </div>
  );
}

/** fieldset + legend, with the same hint/error wiring. */
export function Group({
  id,
  legend,
  hint,
  error,
  children,
  className = "",
}: {
  id: string;
  legend: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset id={id} className={`min-w-0 ${className}`} aria-describedby={ariaFor(id, { hint, error })["aria-describedby"]}>
      <legend className="mb-1 font-display text-base font-semibold text-ink">{legend}</legend>
      {children}
      {hint ? <FieldHint id={id}>{hint}</FieldHint> : null}
      <FieldError id={id} error={error} />
    </fieldset>
  );
}

export function CheckRow({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-chip bg-parchment-dark/60 px-3 py-1 text-base text-ink ring-1 ring-wood/40 has-[:checked]:bg-ink has-[:checked]:text-cream">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="size-5 shrink-0 accent-[#5e3b27]"
      />
      <span>{label}</span>
    </label>
  );
}
