import { Sprite, Window } from "@/components/ui";
import { isDevAuthEnabled } from "@/lib/dev-user";

/**
 * Shown instead of any hearth page when there is no identity. Phase 1 has no
 * real sign-in, so by default every visitor lands here.
 */
export function SignInGate() {
  const dev = process.env.NODE_ENV === "development";
  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-16">
      <Window title="Sign-in is coming soon" titleAs="p" className="w-full">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <Sprite name="dice-32" scale={3} className="motion-safe:animate-float" />
          <div>
            <h1 className="font-display text-2xl font-bold leading-tight [text-shadow:0_2px_0_var(--color-ink)]">
              The cabin door is still locked
            </h1>
            <p className="mt-2 text-lavender">
              PairADice does not have accounts yet. Once sign-in opens, your quests, party and friends will be
              waiting by the fire.
            </p>
            {dev ? (
              <p className="mt-3 rounded-frame bg-ink/40 p-3 text-sm">
                {isDevAuthEnabled()
                  ? "Dev sign-in is on, but no player could be found. Load database/03_seed.sql first."
                  : "Developing locally? Start the server with PAIRADICE_DEV_AUTH=1 to play as a seed player."}
              </p>
            ) : null}
          </div>
        </div>
      </Window>
    </main>
  );
}
