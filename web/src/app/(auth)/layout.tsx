import type { ReactNode } from "react";

// Title-screen pages: no HUD, and they depend on the session cookie.
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-pill bg-ember px-4 py-2 font-display font-semibold text-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      {children}
    </>
  );
}
