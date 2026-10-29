import type { ReactNode } from "react";
import { Avatar, Chip, Meter, Sprite, Tooltip, Window } from "@/components/ui";
import { cartSprite } from "@/lib/format";
import type { PlayerBadge, PlayerCard, PlayerGame, PlayerLanguage, Presence } from "@/lib/types";
import { PresenceLabel } from "./PresenceLabel";
import { Stars } from "./Stars";

function Stat({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`rounded-frame bg-ink/30 px-4 py-3 ${className}`}>
      <dt className="text-sm font-semibold uppercase tracking-wider text-lavender">{label}</dt>
      <dd className="mt-1 font-display text-xl font-semibold">{children}</dd>
    </div>
  );
}

/** Public character sheet. Built from v_player_card plus the player's game, language and badge rows: no gamertags, no auth data. */
export function CharacterSheet({
  card,
  presence,
  isSelf,
  games,
  languages,
  badges,
}: {
  card: PlayerCard;
  presence: Presence;
  isSelf: boolean;
  games: PlayerGame[];
  languages: PlayerLanguage[];
  badges: PlayerBadge[];
}) {
  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      {/* the plaque is a <p> so the h1 below is the first heading in this section */}
      <div className="min-w-0 xl:sticky xl:top-36 xl:self-start">
        <Window
          title={isSelf ? "Your character" : "Character"}
          titleAs="p"
          contentClassName="flex flex-col items-center gap-3 text-center"
        >
          <div className="rounded-window bg-plank-fine p-2 shadow-[0_3px_0_rgb(18_14_31/0.6)] ring-2 ring-ink">
            <Avatar userId={card.user_id} size={64} />
          </div>
          <div className="min-w-0 max-w-full">
            <h1 className="font-display text-3xl font-bold leading-tight [overflow-wrap:anywhere] [text-shadow:0_2px_0_var(--color-ink)]">
              {card.display_name}
            </h1>
            <p className="text-lavender [overflow-wrap:anywhere]">@{card.username}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <PresenceLabel presence={presence} />
            {card.home_region ? (
              <Chip tone="green" icon={<Sprite name="icon-globe" />}>
                <span className="sr-only">Region: </span>
                {card.home_region}
              </Chip>
            ) : null}
            {card.status !== "active" ? <Chip tone="red">{card.status}</Chip> : null}
          </div>
          <div className="mt-2 w-full max-w-xs">
            <Meter value={card.trust_score} label="Trust" />
          </div>
        </Window>
      </div>

      <div className="flex min-w-0 flex-col gap-8">
        <Window title="Stats">
          <dl className="grid gap-3 sm:grid-cols-2">
            <Stat label="Rating" className="sm:col-span-2">
              <span className="flex flex-col gap-1">
                <Stars value={card.avg_rating} />
                {card.avg_rating === null ? (
                  <span className="text-sm font-normal text-lavender">Not rated yet</span>
                ) : null}
              </span>
            </Stat>
            <Stat label="Reviews">{card.review_count}</Stat>
            <Stat label="Quests completed">{card.sessions_completed}</Stat>
          </dl>
        </Window>

        <Window title="Games">
          {games.length === 0 ? (
            <p className="text-sm text-lavender">No games on the shelf yet.</p>
          ) : (
            <ul role="list" className="grid gap-3 sm:grid-cols-2">
              {games.map((g) => (
                <li key={g.profile_id} className="flex min-w-0 items-center gap-3 rounded-frame bg-ink/30 p-3">
                  <Sprite name={cartSprite(g.game_slug)} />
                  <div className="min-w-0 leading-tight">
                    <p className="font-display font-semibold [overflow-wrap:anywhere]">{g.game_name}</p>
                    <p className="text-sm text-lavender">{g.rank_name ?? "Unranked"}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Window>

        <div className="grid gap-8 md:grid-cols-2">
          <Window title="Languages">
            {languages.length === 0 ? (
              <p className="text-sm text-lavender">No languages listed.</p>
            ) : (
              <ul role="list" className="flex flex-wrap gap-2">
                {languages.map((l) => (
                  <li key={l.language_code} className="max-w-full">
                    <Chip tone="blue" className="!rounded-full">
                      <span>
                        {l.name} <span className="font-normal">&middot; {l.proficiency}</span>
                      </span>
                    </Chip>
                  </li>
                ))}
              </ul>
            )}
          </Window>
          <Window title="Medals">
            {badges.length === 0 ? (
              <p className="text-sm text-lavender">No medals earned yet. Good company earns them.</p>
            ) : (
              <ul role="list" className="flex flex-wrap gap-2">
                {badges.map((b) => (
                  <li key={b.badge_id}>
                    {b.description ? (
                      <Tooltip content={b.description}>
                        <Chip tone="yellow" icon={<Sprite name="icon-star" />}>
                          {b.name}
                        </Chip>
                      </Tooltip>
                    ) : (
                      <Chip tone="yellow" icon={<Sprite name="icon-star" />}>
                        {b.name}
                      </Chip>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Window>
        </div>
      </div>
    </div>
  );
}
