import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/hearth/EmptyState";
import { Pager, withParams } from "@/components/mod/Pager";
import { PlayerLink } from "@/components/mod/PlayerLink";
import { ResponsiveTable, type Column } from "@/components/mod/ResponsiveTable";
import { ReportStatusBadge } from "@/components/mod/StatusBadges";
import { TakeItForm } from "@/components/mod/TakeItForm";
import { Button, Window } from "@/components/ui";
import { controlClasses } from "@/components/quest/Field";
import { requireRole } from "@/lib/auth/guards";
import { formatAge, nowMs } from "@/lib/moderation/time";
import { REPORT_CATEGORIES, type ReportRow } from "@/lib/moderation/types";
import { parseReportFilters, type SearchParams } from "@/lib/moderation/validate";
import { listReports } from "@/lib/queries-mod";

export const metadata: Metadata = { title: "Report queue | Guild Hall | PairADice" };

const PATH = "/mod/reports";
const CATEGORY_LABEL: Record<string, string> = { harassment: "Harassment", cheating: "Cheating", spam: "Spam", no_show: "No-show", other: "Other" };

export default async function ReportQueuePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await requireRole("moderator", PATH);
  const filters = parseReportFilters(await searchParams);
  const { rows, nextAfter } = await listReports(viewer, filters);
  const now = nowMs();
  const base = { status: filters.status === "queue" ? null : filters.status, category: filters.category === "all" ? null : filters.category };

  const columns: Column<ReportRow>[] = [
    { header: "Age", cell: (r) => <span className="tabular-nums">{formatAge(r.createdAt, now)}</span> },
    { header: "Category", cell: (r) => CATEGORY_LABEL[r.category] ?? r.category },
    { header: "Reporter", cell: (r) => <PlayerLink user={r.reporter} /> },
    { header: "Reported", cell: (r) => <PlayerLink user={r.reported} /> },
    { header: "Session", cell: (r) => (r.sessionId !== null ? `#${r.sessionId}` : "None") },
    {
      header: "Status",
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <ReportStatusBadge status={r.status} />
          {r.handledBy ? <span className="text-[15px] text-lavender">by {r.handledBy.displayName}</span> : null}
        </div>
      ),
    },
    {
      header: "Action",
      cell: (r) => (
        <div className="flex flex-col items-start gap-2">
          {r.status === "open" ? <TakeItForm reportId={r.reportId} /> : null}
          <Link href={`/mod/reports/${r.reportId}`} className="font-semibold underline underline-offset-2">
            {r.status === "open" || r.status === "reviewing" ? "Open report" : "View report"}
            <span className="sr-only"> {r.reportId}</span>
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl font-bold [text-shadow:0_2px_0_var(--color-ink)]">Report queue</h1>
        <p className="text-lavender">Oldest first, so nobody waits longest.</p>
      </header>

      <Window title="Filter" variant="parchment">
        <form method="get" action={PATH} className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="f-status" className="mb-1 block font-display text-base font-semibold text-ink">
              Status
            </label>
            <select id="f-status" name="status" defaultValue={filters.status} className={`${controlClasses} min-w-48`}>
              <option value="queue">Open and reviewing</option>
              <option value="open">Open</option>
              <option value="reviewing">Reviewing</option>
              <option value="actioned">Actioned</option>
              <option value="dismissed">Dismissed</option>
              <option value="all">All</option>
            </select>
          </div>
          <div>
            <label htmlFor="f-category" className="mb-1 block font-display text-base font-semibold text-ink">
              Category
            </label>
            <select id="f-category" name="category" defaultValue={filters.category} className={`${controlClasses} min-w-40`}>
              <option value="all">All categories</option>
              {REPORT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="blue">
            Apply filters
          </Button>
        </form>
      </Window>

      {rows.length === 0 ? (
        <EmptyState title="The queue is clear" sprite="icon-report-queue" as="h2">
          {filters.after !== null
            ? "No more reports on this page."
            : filters.status === "queue" && filters.category === "all"
              ? "Nobody is waiting on a moderator. Enjoy the quiet."
              : "No reports match these filters. Try widening them."}
        </EmptyState>
      ) : (
        <Window title={`${rows.length} report${rows.length === 1 ? "" : "s"} on this page`} variant="plum" contentClassName="overflow-x-auto">
          <ResponsiveTable caption="Reports, oldest first" columns={columns} rows={rows} rowKey={(r) => r.reportId} />
        </Window>
      )}
      <Pager
        label="Report pages"
        isFirst={filters.after === null}
        firstHref={withParams(PATH, base)}
        nextHref={nextAfter !== null ? withParams(PATH, { ...base, after: nextAfter }) : null}
      />
    </div>
  );
}
