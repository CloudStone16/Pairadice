import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

export type ButtonVariant = "red" | "yellow" | "green" | "blue" | "ghost";
export type ButtonSize = "sm" | "md";

const variants: Record<ButtonVariant, string> = {
  red: "bg-sfc-red text-ink [--key-shadow:#8f3430] hover:brightness-105",
  yellow: "bg-sfc-yellow text-ink [--key-shadow:#9a7424] hover:brightness-105",
  green: "bg-sfc-green text-ink [--key-shadow:#2f6b3c] hover:brightness-105",
  blue: "bg-sfc-blue text-ink [--key-shadow:#2d4f94] hover:brightness-105",
  ghost:
    "bg-plum-2 text-cream ring-1 ring-inset ring-lavender/50 [--key-shadow:#120e1f] hover:bg-plum-2/80",
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-9 px-4 py-1 text-sm",
  md: "min-h-11 px-6 py-2 text-base",
};

export function buttonClasses(
  variant: ButtonVariant = "yellow",
  size: ButtonSize = "md",
  className = "",
): string {
  return [
    "inline-flex select-none items-center justify-center gap-2 rounded-pill font-display font-semibold tracking-wide",
    "shadow-key transition-[transform,box-shadow,filter] duration-100 ease-out",
    "active:translate-y-[3px] active:shadow-key-pressed",
    "aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-disabled:saturate-50",
    "disabled:pointer-events-none disabled:opacity-50 disabled:saturate-50",
    variants[variant],
    sizes[size],
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
}

export function Button({
  variant = "yellow",
  size = "md",
  className = "",
  type = "button",
  ...rest
}: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, size, className)} {...rest} />;
}

export interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function ButtonLink({
  variant = "yellow",
  size = "md",
  className = "",
  ...rest
}: ButtonLinkProps) {
  return <Link className={buttonClasses(variant, size, className)} {...rest} />;
}
