import type { Metadata } from "next";
import Link from "next/link";
import { Sprite, Window } from "@/components/ui";
import { requireRole } from "@/lib/auth/guards";
import { getModOverview } from "@/lib/queries-mod";
import type { SpriteName } from "@/lib/sprite-names";

export const metadata: Metadata = { title: "Guild Hall | PairADice" };

function Count({ n, label, hint, href, icon }: { n: number; label: string; hint: string; href: string; icon: SpriteName }) {
  return (
    <li>
      <Link
        href={href}
        className="group flex h-full items-center gap-4 rounded-frame border-2 border-ink bg-plum-2 p-4 ring-1 ring-inset ring-lavender/50 transition-colors hover:bg-plum"
      >
        <Sprite name={icon} scale={2} />
        <span className="min-w-0">
          <span className="block font-display text-4xl font-bold leading-none tabular-nums">{n}</span>
          <span className="block font-display text-lg font-semibold underline-offset-4 group-hover:underline">{label}</span>
          <span className="block text-[15px] text-lavender">{hint}</span>
        </span>
      </Link>
    </li>
  );
}

export default async function ModPage() {
  const viewer = await requireRole("moderator", "/mod");
  const o = await getModOverview(viewer);
  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-center gap-4">
        <Sprite name="guild-hall-banner-32" scale={3} />
        <div>
          <h1 className="font-display text-3xl font-bold [text-shadow:0_2px_0_var(--color-ink)]">Guild Hall</h1>
          <p className="text-lavender">
            Welcome back, {viewer.displayName}. {o.open + o.reviewing === 0 ? "Nothing is waiting for you." : "Here is what needs a look."}
          </p>
        </div>
      </header>

      <section aria-labelledby="mod-counts">
        <h2 id="mod-counts" className="sr-only">
          Counts
        </h2>
        <ul role="list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Count n={o.open} label="Open reports" hint="Waiting for someone to take them" href="/mod/reports?status=open" icon="icon-report-queue" />
          <Count n={o.reviewing} label="Under review" hint={`${o.mine} of them yours`} href="/mod/reports?status=reviewing" icon="icon-eye-review" />
          <Count n={o.activeSanctions} label="Active sanctions" hint="In force right now" href="/mod/sanctions" icon="icon-gavel" />
          <Count n={o.endingSoon} label="Ending within 24 h" hint="Will lapse by tomorrow" href="/mod/sanctions" icon="icon-hourglass" />
        </ul>
      </section>

      <Window title="Where to next" variant="plum">
        <ul role="list" className="grid gap-3 sm:grid-cols-3">
          <li>
            <Link href="/mod/reports" className="font-display text-lg font-semibold underline underline-offset-4">
              Report queue
            </Link>
            <p className="text-[15px] text-lavender">Take a report, read the evidence, decide.</p>
          </li>
          <li>
            <Link href="/mod/sanctions" className="font-display text-lg font-semibold underline underline-offset-4">
              Sanctions
            </Link>
            <p className="text-[15px] text-lavender">Who is muted, suspended or banned, and lifting early.</p>
          </li>
          <li>
            <Link href="/mod/audit" className="font-display text-lg font-semibold underline underline-offset-4">
              Audit log
            </Link>
            <p className="text-[15px] text-lavender">Every change, who made it and when.</p>
          </li>
        </ul>
      </Window>
    </div>
  );
}
