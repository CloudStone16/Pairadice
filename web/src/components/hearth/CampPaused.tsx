import { ButtonLink, Sprite, Window } from "@/components/ui";

/**
 * Shown instead of a camp whose host is suspended or banned. Deliberately
 * reveals nothing about the camp: no roster, gamertags, chat, rules or invite.
 */
export function CampPaused() {
  return (
    <Window title="Camp paused" titleAs="p" landmark className="mx-auto w-full max-w-xl">
      <div className="flex flex-col items-center gap-4 py-6 text-center sm:flex-row sm:text-left">
        <Sprite name="campfire-1" scale={3} />
        <div>
          <h1 className="font-display text-2xl font-bold leading-tight [text-shadow:0_2px_0_var(--color-ink)]">
            This camp is paused
          </h1>
          <p className="mt-2 text-lavender">
            This camp is paused while the host is away from the fire. Check back soon, or find another
            party on the board.
          </p>
          <ButtonLink href="/board" variant="yellow" size="sm" className="mt-4">
            Back to the Quest Board
          </ButtonLink>
        </div>
      </div>
    </Window>
  );
}
