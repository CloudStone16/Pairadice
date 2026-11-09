import { Chip } from "@/components/ui";
import { formatStamp } from "@/lib/format";
import type { ReportRow, SanctionRow } from "@/lib/moderation/types";
import { CATEGORY_LABELS } from "@/lib/report/validate";

function when(v: string | null, tz: string): string {
  return v ? formatStamp(v, tz) : "";
}

export function SanctionHistory({ sanctions, timeZone }: { sanctions: SanctionRow[]; timeZone: string }) {
  if (sanctions.length === 0) return <p className="text-[15px] text-lavender">A clean record: no sanctions.</p>;
  return (
    <ul role="list" className="flex flex-col gap-2">
      {sanctions.map((s) => (
        <li key={s.sanctionId} className="flex flex-col gap-1 rounded-frame bg-ink/30 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display text-lg font-semibold capitalize">{s.type}</span>
            {s.type === "warn" ? (
              <Chip tone="parchment">Warning on record</Chip>
            ) : s.active ? (
              <Chip tone="red">Active</Chip>
            ) : (
              <Chip tone="parchment">Ended</Chip>
            )}
            <span className="text-[15px] text-lavender">
              {s.type === "warn"
                ? when(s.startsAt, timeZone)
                : `${when(s.startsAt, timeZone)} to ${s.endsAt ? when(s.endsAt, timeZone) : "permanent"}`}
            </span>
          </div>
          <p className="[overflow-wrap:anywhere]">{s.reason}</p>
          <p className="text-[15px] text-lavender">
            Issued by @{s.issuedBy.username}
            {s.reportId ? ` (report #${s.reportId})` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

const STATUS_LABEL = { open: "open", reviewing: "under review", actioned: "actioned", dismissed: "dismissed" } as const;

export function RecentReports({ reports, timeZone }: { reports: ReportRow[]; timeZone: string }) {
  if (reports.length === 0) return <p className="text-[15px] text-lavender">Nobody has reported this player.</p>;
  return (
    <ul role="list" className="flex flex-col gap-2">
      {reports.map((r) => (
        <li key={r.reportId} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-frame bg-ink/30 p-3">
          <div className="min-w-0 flex-1 leading-tight">
            <p className="font-display font-semibold">
              Report #{r.reportId} &middot; {CATEGORY_LABELS[r.category].label}
            </p>
            <p className="text-[15px] text-lavender [overflow-wrap:anywhere]">
              By @{r.reporter.username} &middot; {when(r.createdAt, timeZone)}
              {r.handledBy ? ` · handled by @${r.handledBy.username}` : ""}
            </p>
          </div>
          <Chip tone={r.status === "open" ? "yellow" : r.status === "reviewing" ? "blue" : "green"}>
            {STATUS_LABEL[r.status]}
          </Chip>
        </li>
      ))}
    </ul>
  );
}
