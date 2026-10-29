import { Sprite } from "@/components/ui";

/** Calm notice for a suspended account: the app stays browsable, interaction is closed. */
export function SuspendedBanner() {
  return (
    <section aria-label="Account notice" className="border-b-2 border-ink bg-plum-2 text-cream">
      <p className="mx-auto flex max-w-[1680px] items-center gap-3 px-4 py-2 text-sm">
        <Sprite name="icon-lock" scale={2} />
        <span>
          Your account is suspended &mdash; you can look around, but quests and chat are closed for now.
        </span>
      </p>
    </section>
  );
}
