import type { Presence } from "@/lib/types";

const TEXT: Record<Presence, { label: string; dot: string }> = {
  online: { label: "Online", dot: "bg-sfc-green" },
  away: { label: "Away", dot: "bg-lilac" },
  suspended: { label: "Suspended", dot: "bg-sfc-red" },
};

/** Small coloured dot plus a word, so presence never relies on colour alone. */
export function PresenceLabel({ presence, className = "" }: { presence: Presence; className?: string }) {
  const t = TEXT[presence];
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${className}`}>
      <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${t.dot}`} />
      {t.label}
    </span>
  );
}
