import type { Metadata } from "next";
import { EmptyState } from "@/components/hearth/EmptyState";
import { AuditValues } from "@/components/mod/AuditValues";
import { Pager, withParams } from "@/components/mod/Pager";
import { ResponsiveTable, type Column } from "@/components/mod/ResponsiveTable";
import { controlClasses } from "@/components/quest/Field";
import { Button, Window } from "@/components/ui";
import { requireRole } from "@/lib/auth/guards";
import { formatWhen } from "@/lib/format";
import type { AuditRow } from "@/lib/moderation/types";
import { parseAuditFilters, type SearchParams } from "@/lib/moderation/validate";
import { getViewerTimezone, listAudit, listAuditVocabulary } from "@/lib/queries-mod";

export const metadata: Metadata = { title: "Audit log | Guild Hall | PairADice" };

const PATH = "/mod/audit";

export default async function AuditPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const viewer = await requireRole("moderator", PATH);
  const f = parseAuditFilters(await searchParams);
  const [{ rows, nextBefore }, vocab, tz] = await Promise.all([listAudit(viewer, f), listAuditVocabulary(viewer), getViewerTimezone(viewer)]);
  const base = { entity: f.entity, action: f.action, actor: f.actor, from: f.from, to: f.to };

  const columns: Column<AuditRow>[] = [
    { header: "When", cell: (a) => <time dateTime={a.loggedAt}>{formatWhen(a.loggedAt, tz)}</time> },
    { header: "Actor", cell: (a) => (a.actor ? `@${a.actor.username}` : <span className="italic text-lavender">system</span>) },
    { header: "Entity", cell: (a) => `${a.entity} #${a.entityId}` },
    { header: "Action", cell: (a) => a.action },
    { header: "Before", cell: (a) => <AuditValues timeZone={tz} value={a.oldValue} label={`Old values of log ${a.logId}`} /> },
    { header: "After", cell: (a) => <AuditValues timeZone={tz} value={a.newValue} label={`New values of log ${a.logId}`} /> },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl font-bold [text-shadow:0_2px_0_var(--color-ink)]">Audit log</h1>
        <p className="text-lavender">Read-only, newest first. Times are shown in your timezone ({tz}); the date filters count UTC days.</p>
      </header>

      <Window title="Filter" variant="parchment">
        <form method="get" action={PATH} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label htmlFor="a-entity" className="mb-1 block font-display text-base font-semibold text-ink">
              Entity
            </label>
            <input id="a-entity" name="entity" list="a-entities" defaultValue={f.entity ?? ""} autoComplete="off" maxLength={64} className={controlClasses} />
            <datalist id="a-entities">
              {vocab.entities.map((e) => (
                <option key={e} value={e} />
              ))}
            </datalist>
          </div>
          <div>
            <label htmlFor="a-action" className="mb-1 block font-display text-base font-semibold text-ink">
              Action
            </label>
            <input id="a-action" name="action" list="a-actions" defaultValue={f.action ?? ""} autoComplete="off" maxLength={64} className={controlClasses} />
            <datalist id="a-actions">
              {vocab.actions.map((e) => (
                <option key={e} value={e} />
              ))}
            </datalist>
          </div>
          <div>
            <label htmlFor="a-actor" className="mb-1 block font-display text-base font-semibold text-ink">
              Actor username
            </label>
            <input id="a-actor" name="actor" defaultValue={f.actor ?? ""} autoComplete="off" maxLength={32} className={controlClasses} />
          </div>
          <div>
            <label htmlFor="a-from" className="mb-1 block font-display text-base font-semibold text-ink">
              From (UTC day)
            </label>
            <input id="a-from" name="from" type="date" defaultValue={f.from ?? ""} className={controlClasses} />
          </div>
          <div>
            <label htmlFor="a-to" className="mb-1 block font-display text-base font-semibold text-ink">
              To (UTC day)
            </label>
            <input id="a-to" name="to" type="date" defaultValue={f.to ?? ""} className={controlClasses} />
          </div>
          <div className="sm:col-span-2 lg:col-span-5">
            <Button type="submit" variant="blue">
              Apply filters
            </Button>
          </div>
        </form>
      </Window>

      {rows.length === 0 ? (
        <EmptyState title="No entries" sprite="icon-ledger" as="h2">
          {f.before !== null ? "No older entries." : "Nothing in the log matches these filters."}
        </EmptyState>
      ) : (
        <Window title="Entries" variant="plum" contentClassName="overflow-x-auto">
          <ResponsiveTable caption="Audit log entries, newest first" columns={columns} rows={rows} rowKey={(a) => a.logId} />
        </Window>
      )}
      <Pager
        label="Audit pages"
        isFirst={f.before === null}
        firstHref={withParams(PATH, base)}
        nextHref={nextBefore !== null ? withParams(PATH, { ...base, before: nextBefore }) : null}
      />
    </div>
  );
}
