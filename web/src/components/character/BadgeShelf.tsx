import { Chip, Sprite, Tooltip } from "@/components/ui";
import type { SpriteName } from "@/lib/sprite-names";

export interface ShelfBadge {
  name: string;
  description?: string | null;
  awardedAt?: string | null;
  badge_id?: number;
}

const BADGE_SPRITES: Record<string, SpriteName> = {
  Veteran: "badge-veteran",
  "Great Teammate": "badge-great-teammate",
  Mentor: "badge-mentor",
};

function dateLabel(iso: string): string | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** Medals with their sprites and visible names; unknown badge names keep the generic star chip. */
export function BadgeShelf({ badges }: { badges: readonly ShelfBadge[] }) {
  if (badges.length === 0) {
    return <p className="text-base text-lavender">No medals earned yet. Good company earns them.</p>;
  }
  return (
    <ul role="list" className="flex flex-wrap gap-3">
      {badges.map((b, i) => {
        const sprite = BADGE_SPRITES[b.name];
        const when = b.awardedAt ? dateLabel(b.awardedAt) : null;
        const key = b.badge_id ?? `${b.name}-${i}`;
        if (!sprite) {
          const chip = (
            <Chip tone="yellow" icon={<Sprite name="icon-star" />}>
              {b.name}
            </Chip>
          );
          return <li key={key}>{b.description ? <Tooltip content={b.description}>{chip}</Tooltip> : chip}</li>;
        }
        return (
          <li key={key} className="flex min-w-40 max-w-64 items-start gap-3 rounded-frame bg-ink/30 p-3">
            <Sprite name={sprite} />
            <div className="min-w-0">
              <p className="font-display text-base font-semibold leading-tight">{b.name}</p>
              {b.description ? <p className="text-[15px] text-lavender">{b.description}</p> : null}
              {when ? <p className="text-[15px] text-lavender">Earned {when}</p> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
