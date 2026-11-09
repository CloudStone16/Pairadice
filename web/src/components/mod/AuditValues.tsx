import { formatWhen } from "@/lib/format";
import { toIso } from "@/lib/moderation/time";

const SQL_DATETIME = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/;

/** A JSON snapshot as readable "key: value" pairs. MySQL datetimes (UTC) show in the viewer's timezone. */
function show(v: unknown, tz: string): string {
  if (v === null || v === undefined) return "none";
  if (typeof v === "string") {
    if (SQL_DATETIME.test(v)) return formatWhen(toIso(v), tz) ?? v;
    return v === "" ? "(empty)" : v;
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

export function AuditValues({ value, label, timeZone }: { value: Record<string, unknown> | null; label: string; timeZone: string }) {
  if (value === null) return (
      <span>
        <span aria-hidden="true">&ndash;</span>
        <span className="sr-only">{label}: nothing</span>
      </span>
    );
  const entries = Object.entries(value);
  if (entries.length === 0) return (
      <span>
        (empty)<span className="sr-only"> {label}</span>
      </span>
    );
  return (
    <dl aria-label={label} className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-semibold opacity-80">{k}:</dt>
          <dd className="m-0 [overflow-wrap:anywhere]">{show(v, timeZone)}</dd>
        </div>
      ))}
    </dl>
  );
}
