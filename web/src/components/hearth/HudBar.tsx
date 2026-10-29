import Link from "next/link";
import { Avatar, Meter, Sprite } from "@/components/ui";
import type { UserLite } from "@/lib/types";
import { DevUserSwitch } from "./DevUserSwitch";
import { NavTabs } from "./NavTabs";

const PRESENCE_WORD = { online: "Online", away: "Away", suspended: "Suspended" } as const;

export function HudBar({ user }: { user: UserLite }) {
  return (
    <header className="z-40 bg-dusk lg:sticky lg:top-0">
      <DevUserSwitch currentId={user.user_id} />
      <div className="mx-auto flex max-w-[1680px] flex-wrap items-center gap-x-6 gap-y-0 px-4 py-1 lg:py-2">
        {/* below lg: logo and character share row one, the menu is row two. lg:order-* restores the desktop layout */}
        <div className="order-1 flex min-w-0 flex-1 flex-nowrap items-center justify-between gap-3 lg:contents">
          <Link href="/hearth" className="order-1 flex min-w-0 items-center gap-2 rounded-chip py-1 lg:gap-2.5">
            <Sprite name="dice-32" className="h-[32px] w-[32px] motion-safe:animate-float lg:h-[64px] lg:w-[64px]" alt="" />
            <span className="font-display text-xl font-bold tracking-wide text-cream [text-shadow:0_2px_0_var(--color-ink)] lg:text-2xl">
              PairADice
            </span>
          </Link>

          <Link
            href="/character"
            // the name starts with the visible text ("Aarav Trust 71"), so it satisfies Label in Name (WCAG 2.5.3)
            aria-label={`${user.display_name} Trust ${user.trust_score}, ${PRESENCE_WORD[user.presence]} — your character sheet`}
            className="order-2 ml-auto flex shrink-0 items-center gap-3 rounded-pill bg-plum p-1 ring-1 ring-lavender/40 transition-colors hover:bg-plum-2 sm:py-1.5 sm:pl-2 sm:pr-4 lg:order-3"
          >
            <Avatar userId={user.user_id} size={32} status={user.presence} statusText={false} />
            <span className="hidden flex-col leading-tight sm:flex">
              <span className="max-w-32 truncate font-display text-sm font-semibold">{user.display_name}</span>{" "}
              <span className="w-28">
                <Meter value={user.trust_score} label="Trust" />
              </span>
            </span>
          </Link>
        </div>

        <div className="order-2 w-full lg:order-2 lg:w-auto lg:flex-1">
          <NavTabs />
        </div>
      </div>
      {/* wooden beam with an ember highlight; the 4px ink line below closes the HUD */}
      <div aria-hidden="true" className="border-b-4 border-ink shadow-[0_6px_0_rgb(18_14_31/0.5)]">
        <div className="h-px bg-ember/70" />
        <div className="h-3 bg-plank-fine lg:h-4" />
      </div>
    </header>
  );
}
