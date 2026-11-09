import { ButtonLink, Sprite, Window } from "@/components/ui";
import { safeNextOrNull } from "@/lib/auth/safe-next";
import { getViewerState } from "@/lib/auth/viewer";
import { isDevAuthEnabled } from "@/lib/dev-user";

/**
 * Shown instead of any hearth page when there is no identity. `next` is the
 * path to return to after signing in, when the caller knows it.
 */
export async function SignInGate({ next }: { next?: string }) {
  const dev = process.env.NODE_ENV === "development";
  const { sessionExpired } = await getViewerState();
  const safeNext = safeNextOrNull(next) ?? undefined;
  const suffix = safeNext ? `?next=${encodeURIComponent(safeNext)}` : "";
  const signInHref = `/sign-in${suffix}`;
  const signUpHref = `/sign-up${suffix}`;
  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-16">
      <Window title="The cabin door is closed" titleAs="p" className="w-full">
        <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
          <Sprite name="icon-door-closed" scale={4} className="motion-safe:animate-float" />
          <div>
            <h1 className="font-display text-2xl font-bold leading-tight [text-shadow:0_2px_0_var(--color-ink)]">
              Sign in to join the party
            </h1>
            <p className="mt-2 text-lavender">
              Your quests, party and friends are waiting by the fire. Sign in, or make a new character to get started.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-3 sm:justify-start">
              <ButtonLink href={signInHref} variant="yellow">
                <Sprite name="icon-door" />
                Sign in
              </ButtonLink>
              <ButtonLink href={signUpHref} variant="ghost">
                <Sprite name="icon-star" />
                Create account
              </ButtonLink>
            </div>
            {sessionExpired ? (
              <p role="status" className="mt-4 rounded-frame bg-ink/40 p-3 text-sm">
                Your session has expired. Please sign in again.
              </p>
            ) : null}
            {dev && !sessionExpired ? (
              <p className="mt-4 rounded-frame bg-ink/40 p-3 text-sm">
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
