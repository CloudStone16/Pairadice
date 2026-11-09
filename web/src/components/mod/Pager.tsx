import Link from "next/link";
import { buttonClasses } from "@/components/ui";

/** href with the given params (empty and null values dropped). */
export function withParams(path: string, params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && String(v) !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

/** "Next page" and "Back to the first page" links for keyset pagination. */
export function Pager({ nextHref, firstHref, isFirst, label }: { nextHref: string | null; firstHref: string; isFirst: boolean; label: string }) {
  if (nextHref === null && isFirst) return null;
  return (
    <nav aria-label={label} className="mt-4 flex flex-wrap items-center gap-3">
      {!isFirst ? (
        <Link href={firstHref} className={buttonClasses("ghost", "sm")}>
          Back to the first page
        </Link>
      ) : null}
      {nextHref ? (
        <Link href={nextHref} rel="next" className={buttonClasses("yellow", "sm")}>
          Next page
        </Link>
      ) : (
        <p className="text-[15px] text-lavender">That is the end of the list.</p>
      )}
    </nav>
  );
}
