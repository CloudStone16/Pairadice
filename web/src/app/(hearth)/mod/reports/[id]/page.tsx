import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AuditValues } from "@/components/mod/AuditValues";
import { PlayerLink } from "@/components/mod/PlayerLink";
import { ReportActionPanel } from "@/components/mod/ReportActionPanel";
import { AccountStatusBadge, ReportStatusBadge, SanctionTypeBadge } from "@/components/mod/StatusBadges";
import { TakeItForm } from "@/components/mod/TakeItForm";
import { Meter, Window } from "@/components/ui";
import { hasRole, requireRole } from "@/lib/auth/guards";
import { formatStamp, formatWhen } from "@/lib/format";
import { formatRelative, nowMs } from "@/lib/moderation/time";
import { parseId } from "@/lib/moderation/validate";
import { getReportDetail, getViewerTimezone, type PartyCard } from "@/lib/queries-mod";

export const metadata: Metadata = { title: "Report | Guild Hall | PairADice" };

const CATEGORY_LABEL: Record<string, string> = { harassment: "Harassment", cheating: "Cheating", spam: "Spam", no_show: "No-show", other: "Other" };

function Party({ title, card, earlierLabel }: { title: string; card: PartyCard; earlierLabel: string }) {
  return (
    <Window title={title} titleAs="h2" variant="plum">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PlayerLink user={card.chip} className="text-lg" />
          <AccountStatusBadge status={card.chip.status} />
        </div>
        <Meter label="Trust" value={card.trustScore} />
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-chip bg-ink/30 p-2">
            <dd className="m-0 font-display text-2xl font-bold tabular-nums">{card.reportsAgainst}</dd>
            <dt className="text-[15px] text-lavender">{earlierLabel}</dt>
          </div>
          <div className="rounded-chip bg-ink/30 p-2">
            <dd className="m-0 font-display text-2xl font-bold tabular-nums">{card.reportsFiled}</dd>
            <dt className="text-[15px] text-lavender">Filed before</dt>
          </div>
          <div className="rounded-chip bg-ink/30 p-2">
            <dd className="m-0 font-display text-2xl font-bold tabular-nums">{card.sanctions}</dd>
            <dt className="text-[15px] text-lavender">Sanctions</dt>
          </div>
        </dl>
      </div>
    </Window>
  );
}

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reportId = parseId(id);
  const path = `/mod/reports/${reportId ?? ""}`;
  const viewer = await requireRole("moderator", path);
  if (reportId === null) notFound();
  const detail = await getReportDetail(viewer, reportId);
  if (!detail) notFound();
  const tz = await getViewerTimezone(viewer);
  const now = nowMs();

  const { report, message } = detail;
  const resolved = report.status === "actioned" || report.status === "dismissed";
  const isParty = viewer.userId === report.reporter.userId || viewer.userId === report.reported.userId;
  const isAdmin = hasRole(viewer, "admin");
  const mine = report.handledBy?.userId === viewer.userId;
  const canAct = !resolved && !isParty && report.status === "reviewing" && (mine || isAdmin);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <Link href="/mod/reports" className="inline-flex min-h-6 w-fit items-center text-[15px] font-semibold underline underline-offset-2">
          Back to the queue
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-3xl font-bold [text-shadow:0_2px_0_var(--color-ink)]">Report #{report.reportId}</h1>
          <ReportStatusBadge status={report.status} />
        </div>
        <p className="text-lavender">
          {CATEGORY_LABEL[report.category] ?? report.category}, filed {formatRelative(report.createdAt, now)} ({formatWhen(report.createdAt, tz)})
          {report.sessionId !== null ? `, session #${report.sessionId}` : ""}.
          {report.handledBy ? ` Handled by ${report.handledBy.displayName}.` : ""}
          {report.resolvedAt ? ` Resolved ${formatWhen(report.resolvedAt, tz)}.` : ""}
        </p>
      </header>

      <div className="grid gap-x-6 gap-y-8 md:grid-cols-2">
        <Party title="Reporter" card={detail.reporter} earlierLabel="Reports against, earlier" />
        <Party title="Reported player" card={detail.reported} earlierLabel="Reports against, earlier" />
      </div>

      <Window title="What the reporter wrote" variant="parchment">
        {detail.description ? <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{detail.description}</p> : <p className="text-wood-dark">No description was given.</p>}
      </Window>

      <Window title="The reported message" variant="parchment">
        {message ? (
          <>
            <p className="mb-3 text-[15px] text-wood-dark">
              Up to ten lines around it, from the same session chat or direct-message pair only. Hidden lines are still shown to staff.
            </p>
            <ol role="list" className="flex flex-col gap-2">
              {detail.context.map((m) => (
                <li
                  key={m.messageId}
                  aria-current={m.isReported ? "true" : undefined}
                  className={`rounded-chip px-3 py-2 ${m.isReported ? "border-2 border-ink bg-parchment-dark" : "bg-parchment-dark/40"}`}
                >
                  <p className="flex flex-wrap items-center gap-x-2 text-[15px]">
                    <PlayerLink user={m.sender} />
                    <span className="text-wood-dark">{formatStamp(m.sentAt, tz)}</span>
                    {m.isReported ? <span className="rounded-chip bg-ink px-2 font-display text-sm font-semibold text-cream">Reported line</span> : null}
                    {m.hidden ? <span className="rounded-chip border border-ink px-2 font-display text-sm font-semibold">{"✕"} Hidden</span> : null}
                  </p>
                  <p className={`whitespace-pre-wrap [overflow-wrap:anywhere] ${m.hidden ? "italic" : ""}`}>{m.content}</p>
                </li>
              ))}
            </ol>
          </>
        ) : (
          <p className="text-wood-dark">{report.messageId !== null ? "The reported message could not be loaded." : "The reporter did not point at a message."}</p>
        )}
      </Window>

      <section aria-labelledby="actions-h" className="flex flex-col gap-4">
        <h2 id="actions-h" className="font-display text-2xl font-bold">
          Decide
        </h2>
        {resolved ? (
          <p className="rounded-frame border border-lavender/40 bg-ink/30 p-4">This report is closed, so it is read-only. Its history is below.</p>
        ) : isParty ? (
          <p className="rounded-frame border border-lavender/40 bg-ink/30 p-4">
            You are part of this report, so another moderator has to handle it.
          </p>
        ) : report.status === "open" ? (
          <div className="flex flex-wrap items-center gap-4 rounded-frame border border-lavender/40 bg-ink/30 p-4">
            <p>Take the report first. Then the actions appear here.</p>
            <TakeItForm reportId={report.reportId} size="md" />
          </div>
        ) : !canAct ? (
          <p className="rounded-frame border border-lavender/40 bg-ink/30 p-4">
            {report.handledBy?.displayName ?? "Another moderator"} is handling this report. Only they or an admin can act on it.
          </p>
        ) : (
          <ReportActionPanel
            reportId={report.reportId}
            reportedUserId={report.reported.userId}
            reportedName={report.reported.displayName}
            canBan={isAdmin}
            message={message ? { messageId: message.messageId, hidden: message.hidden } : null}
          />
        )}
      </section>

      {detail.sanctions.length > 0 ? (
        <Window title="Sanctions from this report" variant="plum">
          <ul role="list" className="flex flex-col gap-2">
            {detail.sanctions.map((s) => (
              <li key={s.sanctionId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <SanctionTypeBadge type={s.type} />
                <span className="[overflow-wrap:anywhere]">{s.reason}</span>
                <span className="text-[15px] text-lavender">
                  {s.type === "warn"
                    ? "Warning on record"
                    : `${s.endsAt ? `until ${formatWhen(s.endsAt, tz)}` : "no end date"}, ${s.active ? "in force" : "ended"}`}
                </span>
              </li>
            ))}
          </ul>
        </Window>
      ) : null}

      <Window title="History" variant="plum">
        {detail.audit.length === 0 ? (
          <p className="text-lavender">Nothing has happened to this report yet.</p>
        ) : (
          <ol role="list" className="flex flex-col gap-3">
            {detail.audit.map((a) => (
              <li key={a.logId} className="border-l-2 border-lavender/50 pl-3">
                <p className="font-semibold">
                  {a.entity} {a.action}
                  <span className="font-normal text-lavender">
                    {" "}
                    by {a.actor ? `@${a.actor.username}` : "system"}, {formatWhen(a.loggedAt, tz)}
                  </span>
                </p>
                <div className="text-[15px]">
                  <AuditValues timeZone={tz} value={a.newValue} label={`New values of log ${a.logId}`} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </Window>
    </div>
  );
}
