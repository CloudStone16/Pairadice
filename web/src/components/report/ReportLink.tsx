import Link from "next/link";
import { Sprite } from "@/components/ui";
import { reportHref } from "@/lib/report/validate";

/** A small "Report" link (24 px+ target) to /report/<id>, returning to `back`. */
export function ReportLink({
  userId,
  name,
  back,
  sessionId,
  className = "",
}: {
  userId: number;
  name: string;
  back: string;
  sessionId?: number;
  className?: string;
}) {
  return (
    <Link
      href={reportHref(userId, back, sessionId)}
      aria-label={`Report ${name}`}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-pill px-3 py-1 text-sm font-semibold text-lavender underline-offset-2 hover:bg-plum-2 hover:text-cream hover:underline ${className}`}
    >
      <Sprite name="icon-flag" />
      Report
    </Link>
  );
}
