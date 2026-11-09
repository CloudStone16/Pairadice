import { Chip, Window } from "@/components/ui";
import { formatStamp } from "@/lib/format";
import type { MyReportRow } from "@/lib/mutations/report";
import { CATEGORY_LABELS } from "@/lib/report/validate";

const TONE = { open: "yellow", reviewing: "blue", resolved: "green" } as const;
const LABEL = { open: "open", reviewing: "under review", resolved: "resolved" } as const;

/** The player's own reports. Status is text first; the handler and any sanction are never shown. */
export function MyReports({ reports, timeZone, error }: { reports: MyReportRow[]; timeZone: string; error?: string }) {
  return (
    <Window title="My reports">
      {error ? (
        <p role="alert" className="font-semibold">
          {error}
        </p>
      ) : reports.length === 0 ? (
        <p className="text-[15px] text-lavender">You have not reported anyone. That is a good sign.</p>
      ) : (
        <ul role="list" className="flex flex-col gap-2">
          {reports.map((r) => (
            <li key={r.reportId} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-frame bg-ink/30 p-3">
              <div className="min-w-0 flex-1 leading-tight">
                <p className="font-display font-semibold [overflow-wrap:anywhere]">
                  @{r.reportedUsername} <span className="text-[15px] font-normal text-lavender">&middot; {CATEGORY_LABELS[r.category].label}</span>
                </p>
                <p className="text-[15px] text-lavender">Sent {formatStamp(r.createdAt, timeZone)}</p>
              </div>
              <Chip tone={TONE[r.status]}>
                <span className="sr-only">Status: </span>
                {LABEL[r.status]}
              </Chip>
            </li>
          ))}
        </ul>
      )}
    </Window>
  );
}
