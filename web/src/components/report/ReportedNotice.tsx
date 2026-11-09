import { Sprite } from "@/components/ui";

/** Shown on the page a player came back to after reporting (?reported=1). A persistent polite status. */
export function ReportedNotice({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p role="status" className="flex items-start gap-2 rounded-frame bg-plum-2 p-3 font-semibold ring-1 ring-inset ring-lavender/50">
      <Sprite name="icon-check" className="mt-0.5" />
      Thanks, a moderator will look at this.
    </p>
  );
}

/** True when the searchParams value is the "reported" flag. */
export function isReported(raw: string | string[] | undefined): boolean {
  return (Array.isArray(raw) ? raw[0] : raw) === "1";
}
