import type { ReactNode } from "react";

/**
 * A checkbox or radio drawn as a tappable row (or pill). The focus ring sits on the label because the
 * checked state is an ink fill, where an ink outline on the bare input would vanish.
 */
export function ChoiceRow({
  type,
  name,
  value,
  label,
  description,
  checked,
  defaultChecked,
  disabled,
  onChange,
  pill = false,
}: {
  type: "checkbox" | "radio";
  name: string;
  value: string;
  label: ReactNode;
  description?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
  pill?: boolean;
}) {
  return (
    <label
      className={`group flex min-h-11 cursor-pointer items-start gap-2.5 bg-parchment-dark/60 px-3 py-2 text-base text-ink accent-wood-dark ring-1 ring-wood/40 has-[:checked]:bg-ink has-[:checked]:text-cream has-[:checked]:accent-ember has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-ink ${
        pill ? "items-center rounded-pill" : "rounded-chip"
      }`}
    >
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        defaultChecked={defaultChecked}
        disabled={disabled}
        onChange={onChange ? (e) => onChange(e.currentTarget.checked) : undefined}
        className="mt-0.5 size-5 shrink-0 focus-visible:outline-none"
      />
      <span className="min-w-0 [overflow-wrap:anywhere]">
        <span className="font-semibold">{label}</span>
        {description ? (
          <span className="block text-[15px] font-normal text-wood-dark group-has-[:checked]:text-cream">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
