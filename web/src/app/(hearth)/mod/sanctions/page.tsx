import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/hearth/EmptyState";
import { ExpiryForm } from "@/components/mod/ExpiryForm";
import { LiftForm } from "@/components/mod/LiftForm";
import { Pager, withParams } from "@/components/mod/Pager";
import { PlayerLink } from "@/components/mod/PlayerLink";
import { ResponsiveTable, type Column } from "@/components/mod/ResponsiveTable";
import { ActiveBadge, SanctionTypeBadge } from "@/components/mod/StatusBadges";
import { Chip, Window } from "@/components/ui";
import { hasRole, requireRole } from "@/lib/auth/guards";
import { formatWhen } from "@/lib/format";
import { expireSanctions } from "@/lib/mutations/moderation";
import { formatRelative, nowMs } from "@/lib/moderation/time";
import type { SanctionRow } from "@/lib/moderation/types";
import { parseSanctionFilters, type SanctionTab, type SearchParams } from "@/lib/moderation/validate";
import { getViewerTimezone, listSanctions } from "@/lib/queries-mod";

export const metadata: Metadata = { title: "Sanctions | Guild Hall | PairADice" };

const PATH = "/mod/sanctions";
const TABS: Array<{ tab: SanctionTab; label: string }> = [
  { tab: "active", label: "Active" },
  { tab: "ended", label: "Ended" },
  { tab: "all", label: "All" },
];

export default async function SanctionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await requireRole("moderator", PATH);
  const filters = parseSanctionFilters(await searchParams);
  // nothing schedules sp_expire_sanctions, so run it on every visit; a failure must not block the page
  await expireSanctions(viewer);
  const [{ rows, nextBefore }, tz] = await Promise.all([listSanctions(viewer, filters), getViewerTimezone(viewer)]);
  const now = nowMs();
  const isAdmin = hasRole(viewer, "admin");

  const columns: Column<SanctionRow>[] = [
    { header: "Player", cell: (s) => <PlayerLink user={s.user} /> },
    {
      header: "Type",
      cell: (s) => (
        <div className="flex flex-col items-start gap-1">
          <SanctionTypeBadge type={s.type} />
          {s.type === "warn" ? <Chip tone="parchment">On record</Chip> : <ActiveBadge active={s.active} />}
        </div>
      ),
    },
    { header: "Reason", cell: (s) => s.reason },
    { header: "Issued by", cell: (s) => <PlayerLink user={s.issuedBy} /> },
    { header: "Starts", cell: (s) => formatWhen(s.startsAt, tz) },
    {
      header: "Ends",
      cell: (s) =>
        s.type === "warn" ? (
          "Warning on record"
        ) : s.endsAt ? (
          <>
            <span className="block font-semibold">{formatRelative(s.endsAt, now)}</span>
            <time dateTime={s.endsAt} className="block text-[15px] text-lavender">
              {formatWhen(s.endsAt, tz)}
            </time>
          </>
        ) : (
          "Permanent"
        ),
    },
    {
      header: "Report",
      cell: (s) =>
        s.reportId !== null ? (
          <Link href={`/mod/reports/${s.reportId}`} className="font-semibold underline underline-offset-2">
            #{s.reportId}
          </Link>
        ) : (
          "None"
        ),
    },
    {
      header: "Lift",
      className: "min-w-52",
      cell: (s) =>
        s.type === "warn" ? (
          <span className="text-lavender">Nothing to lift</span>
        ) : !s.active ? (
          <span className="text-lavender">Already ended</span>
        ) : s.type === "ban" && !isAdmin ? (
          <span className="text-lavender">Only an admin can lift a ban</span>
        ) : (
          <LiftForm sanctionId={s.sanctionId} who={`@${s.user.username}`} />
        ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold [text-shadow:0_2px_0_var(--color-ink)]">Sanctions</h1>
          <p className="text-lavender">Times are shown in your timezone ({tz}). Expiry ran just now.</p>
        </div>
        <ExpiryForm />
      </header>

      <nav aria-label="Sanction filter">
        <ul role="list" className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <li key={t.tab}>
              <Link
                href={withParams(PATH, { tab: t.tab === "active" ? null : t.tab })}
                aria-current={filters.tab === t.tab ? "page" : undefined}
                className={`inline-flex min-h-11 items-center rounded-pill px-5 font-display text-base font-semibold ring-1 ring-inset ${
                  filters.tab === t.tab ? "bg-parchment text-ink ring-wood underline decoration-2 underline-offset-4" : "bg-plum-2 text-cream ring-lavender/50 hover:bg-plum"
                }`}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {rows.length === 0 ? (
        <EmptyState title={filters.tab === "active" ? "No active sanctions" : "Nothing here"} sprite="icon-scales" as="h2">
          {filters.tab === "active" ? "Everyone is in good standing right now." : "No sanctions match this tab."}
        </EmptyState>
      ) : (
        <Window title={`${filters.tab === "all" ? "All" : filters.tab === "active" ? "Active" : "Ended"} sanctions`} variant="plum" contentClassName="overflow-x-auto">
          <ResponsiveTable caption="Sanctions, newest first" columns={columns} rows={rows} rowKey={(s) => s.sanctionId} />
        </Window>
      )}
      <Pager
        label="Sanction pages"
        isFirst={filters.before === null}
        firstHref={withParams(PATH, { tab: filters.tab === "active" ? null : filters.tab })}
        nextHref={nextBefore !== null ? withParams(PATH, { tab: filters.tab === "active" ? null : filters.tab, before: nextBefore }) : null}
      />
    </div>
  );
}
