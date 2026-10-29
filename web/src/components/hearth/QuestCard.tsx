import Link from "next/link";
import { Avatar, Chip, Sprite } from "@/components/ui";
import { cartSprite, formatWhen, languageName, matchReasons } from "@/lib/format";
import type { Quest } from "@/lib/types";
import { SeatPips } from "./SeatPips";
import { UserLink } from "./UserLink";

const TILT = [
  "motion-safe:rotate-[0.6deg]",
  "motion-safe:-rotate-[0.5deg]",
  "motion-safe:-rotate-[0.8deg]",
  "motion-safe:rotate-[0.4deg]",
] as const;

/** Alternating fasteners: red pin, tape, blue pin, tape. */
function Fastener({ index }: { index: number }) {
  if (index % 2 === 1) {
    return (
      <span
        aria-hidden="true"
        className="absolute -top-2.5 left-1/2 h-4 w-14 -translate-x-1/2 -rotate-2 bg-parchment-dark/85 shadow-[0_1px_0_rgb(18_14_31/0.35)] ring-1 ring-wood/50"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`absolute -top-2 left-1/2 h-3.5 w-3.5 -translate-x-1/2 rounded-full shadow-[0_2px_0_rgb(18_14_31/0.6)] ring-2 ring-ink ${
        index % 4 === 0 ? "bg-sfc-red" : "bg-sfc-blue"
      }`}
    />
  );
}

/**
 * Parchment quest card pinned to the board. The title link stretches over the
 * whole card; inner links sit above it. `index` varies the tilt and fastener.
 */
export function QuestCard({ quest, timeZone, index = 0 }: { quest: Quest; timeZone: string; index?: number }) {
  const when = formatWhen(quest.scheduled_start, timeZone);
  const reasons = quest.fit ? matchReasons(quest.fit) : null;
  const ranks =
    quest.min_rank || quest.max_rank
      ? [quest.min_rank, quest.max_rank].filter(Boolean).join(" to ")
      : null;

  return (
    <article
      className={`bg-ruled group relative flex min-w-0 flex-col gap-3 rounded-window bg-parchment p-4 pt-6 text-ink shadow-window ring-1 ring-inset ring-wood/60 transition duration-200 ease-out [--focus-ring:var(--color-ink)] hover:shadow-[0_8px_0_rgb(18_14_31/0.55),0_0_28px_rgb(242_166_90/0.4)] motion-safe:hover:-translate-y-1 motion-safe:hover:rotate-0 motion-safe:has-[a:focus-visible]:-translate-y-1 motion-safe:has-[a:focus-visible]:rotate-0 has-[a:focus-visible]:outline-3 has-[a:focus-visible]:outline-offset-4 has-[a:focus-visible]:outline-cream ${TILT[index % TILT.length]}`}
    >
      <Fastener index={index} />
      {/* stitched edge and a folded corner */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-1.5 rounded-[10px] border border-dashed border-wood/40"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 h-5 w-5 rounded-tr-[12px] bg-[linear-gradient(225deg,var(--color-wood-dark)_50%,var(--color-parchment-dark)_50%)] shadow-[-1px_1px_0_rgb(18_14_31/0.45)]"
      />
      <div className="flex items-start gap-3">
        <div className="shrink-0 rounded-frame bg-wood-dark p-1.5 ring-2 ring-ink">
          <Sprite name={cartSprite(quest.game_slug)} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-bold leading-snug [overflow-wrap:anywhere]">
            <Link
              href={`/camp/${quest.session_id}`}
              className="rounded-sm after:absolute after:inset-0 after:rounded-window after:content-[''] focus-visible:outline-none"
            >
              {quest.title}
            </Link>
          </h3>
          <p className="text-sm font-semibold text-wood-dark">
            {quest.game} &middot; {quest.game_mode}
            <span className="font-normal"> &middot; {quest.platform}</span>
          </p>
        </div>
      </div>

      <ul role="list" className="flex flex-wrap items-center gap-2" aria-label="Quest details">
        {when ? (
          <li>
            <Chip tone="lavender" icon={<Sprite name="icon-clock" />}>
              {when}
            </Chip>
          </li>
        ) : (
          <li>
            <Chip tone="lavender" icon={<Sprite name="icon-clock" />}>
              Anytime
            </Chip>
          </li>
        )}
        {quest.region ? (
          <li>
            <Chip tone="green" icon={<Sprite name="icon-globe" />}>
              <span className="sr-only">Region: </span>
              {quest.region}
            </Chip>
          </li>
        ) : null}
        {quest.voice_required ? (
          <li>
            <Chip tone="blue" icon={<Sprite name="icon-mic" />}>
              Voice
            </Chip>
          </li>
        ) : null}
        {ranks ? (
          <li>
            <Chip tone="yellow" icon={<Sprite name="icon-shield" />}>
              {ranks}
            </Chip>
          </li>
        ) : null}
      </ul>

      <div className="flex flex-col gap-1 text-sm">
        <span className="inline-flex items-center gap-2 font-semibold">
          <SeatPips filled={quest.current_players} max={quest.max_players} />
          <span>
            {quest.open_slots} open {quest.open_slots === 1 ? "seat" : "seats"}
          </span>
        </span>
        {quest.looking_for.length > 0 ? (
          <p className="text-wood-dark [overflow-wrap:anywhere]">
            <span className="font-semibold">Looking for:</span> {quest.looking_for.join(", ")}
          </p>
        ) : null}
      </div>

      {quest.tags.length > 0 || quest.languages.length > 0 ? (
        <p className="text-sm text-wood-dark [overflow-wrap:anywhere]">
          {[...quest.tags.map((t) => `#${t}`), ...quest.languages.map(languageName)].join(" · ")}
        </p>
      ) : null}

      {reasons ? (
        <div role="group" aria-label="Why this match" className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold uppercase tracking-wider text-wood-dark">Why this match</span>
          {reasons.length > 0 ? (
            reasons.map((r) => (
              <Chip key={r} tone="ember">
                {r}
              </Chip>
            ))
          ) : (
            <Chip tone="lavender">A seat that suits you</Chip>
          )}
        </div>
      ) : null}

      <div className="relative z-10 mt-auto flex items-center gap-2 border-t border-wood/30 pt-3 text-sm">
        <Avatar userId={quest.host_id} size={32} />
        <span className="min-w-0 [overflow-wrap:anywhere]">
          Hosted by{" "}
          <UserLink userId={quest.host_id} tone="light" inline>
            {quest.host}
          </UserLink>
        </span>
      </div>
    </article>
  );
}
