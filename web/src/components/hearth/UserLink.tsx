import Link from "next/link";
import type { ReactNode } from "react";

const TONES = {
  // on plum, ink and wood surfaces
  dark: "text-cream decoration-ember/60 hover:text-ember hover:decoration-ember",
  // on parchment (ember text would not be readable there)
  light: "text-ink decoration-wood/70 hover:text-wood-dark hover:decoration-wood-dark",
} as const;

/** Every username in the app links to that player's character sheet. */
export function UserLink({
  userId,
  children,
  className = "",
  tone = "dark",
  inline = false,
}: {
  userId: number;
  children: ReactNode;
  className?: string;
  tone?: keyof typeof TONES;
  /** Set for links inside a sentence ("Hosted by ..."); standalone links get a 24px minimum target. */
  inline?: boolean;
}) {
  return (
    <Link
      href={`/character/${userId}`}
      className={`rounded-sm font-semibold ${inline ? "" : "inline-flex min-h-6 max-w-full items-center"} underline underline-offset-4 transition-colors hover:decoration-2 ${TONES[tone]} ${className}`}
    >
      {children}
    </Link>
  );
}
