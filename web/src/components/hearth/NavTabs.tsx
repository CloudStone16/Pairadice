"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sprite } from "@/components/ui";
import type { SpriteName } from "@/lib/sprite-names";

interface Tab {
  href: string;
  label: string;
  /** Short label shown under the icon below lg. */
  short: string;
  icon: SpriteName;
  exact?: boolean;
  /** Other paths that belong to this tab: it shows a "you are in this part of the site" cue there. */
  within?: string;
}

const TABS: Tab[] = [
  { href: "/hearth", label: "Hearth", short: "Hearth", icon: "icon-home" },
  { href: "/board", label: "Quest Board", short: "Board", icon: "icon-board", within: "/camp" },
  { href: "/party", label: "My Party", short: "Party", icon: "icon-party" },
  { href: "/friends", label: "Friends", short: "Friends", icon: "icon-friends" },
  // other players' sheets live under /character/<id>; only your own is "current"
  { href: "/character", label: "Character", short: "Me", icon: "icon-character", exact: true },
];

const isUnder = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/**
 * RPG-menu tabs: one row of icons with short labels on phones, icon plus full label on desktop.
 * The current page gets aria-current="page"; a quest's camp page marks the Quest Board tab
 * with aria-current="location" and a quieter ember underline.
 */
export function NavTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main menu" className="py-1">
      <ul role="list" className="flex flex-nowrap items-stretch justify-between gap-1 lg:justify-start lg:gap-1.5">
        {TABS.map((tab) => {
          const active = tab.exact ? pathname === tab.href : isUnder(pathname, tab.href);
          const inSection = !active && tab.within !== undefined && isUnder(pathname, tab.within);
          const current = active ? "page" : inSection ? "location" : undefined;
          return (
            <li key={tab.href} className="min-w-0 flex-1 lg:flex-none">
              <Link
                href={tab.href}
                aria-current={current}
                className={`flex h-full flex-col items-center gap-0.5 rounded-pill px-1 py-1 font-display font-semibold transition duration-150 lg:flex-row lg:gap-2 lg:px-2.5 lg:py-1 xl:px-3 lg:text-base ${
                  active
                    ? "bg-plum-2 text-cream shadow-[inset_0_-3px_0_var(--color-ember)] ring-2 ring-ember forced-colors:outline-2 forced-colors:outline-[Highlight] forced-colors:underline forced-colors:decoration-4 forced-colors:underline-offset-4"
                    : inSection
                      ? "text-cream shadow-[inset_0_-3px_0_rgb(242_166_90/0.6)] forced-colors:underline forced-colors:decoration-2 forced-colors:underline-offset-4 hover:bg-plum"
                      : "text-lavender hover:bg-plum hover:text-cream motion-safe:hover:-translate-y-0.5"
                }`}
              >
                <Sprite name={tab.icon} scale={2} className={active ? "motion-safe:animate-pop" : ""} />
                <span className="text-[11px] leading-tight lg:hidden">{tab.short}</span>
                <span className="hidden lg:inline">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
