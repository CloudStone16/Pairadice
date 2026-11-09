"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sprite } from "@/components/ui";
import type { SpriteName } from "@/lib/sprite-names";

const LINKS: Array<{ href: string; label: string; icon: SpriteName; exact?: boolean }> = [
  { href: "/mod", label: "Overview", icon: "icon-shield", exact: true },
  { href: "/mod/reports", label: "Reports", icon: "icon-report-queue" },
  { href: "/mod/sanctions", label: "Sanctions", icon: "icon-gavel" },
  { href: "/mod/audit", label: "Audit log", icon: "icon-ledger" },
];

/** Sub-navigation inside the Guild Hall: a plain row of links, the current one marked with aria-current. */
export function ModNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Guild Hall sections" className="mb-6">
      <ul role="list" className="flex flex-wrap gap-2">
        {LINKS.map((l) => {
          const current = l.exact ? pathname === l.href : pathname === l.href || pathname.startsWith(`${l.href}/`);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={current ? "page" : undefined}
                className={`inline-flex min-h-11 items-center gap-2 rounded-pill px-4 py-1 font-display text-base font-semibold ring-1 ring-inset transition-colors ${
                  current
                    ? "bg-parchment text-ink ring-wood [--focus-ring:var(--color-cream)] underline decoration-2 underline-offset-4"
                    : "bg-plum-2 text-cream ring-lavender/50 hover:bg-plum"
                }`}
              >
                <Sprite name={l.icon} />
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
