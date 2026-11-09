import { buttonClasses } from "@/components/ui/Button";
import { Sprite } from "@/components/ui";

export function DiscordButton({ enabled }: { enabled: boolean }) {
  if (enabled) {
    return (
      // plain anchor: /auth/discord is a route handler that redirects off-site
      <a href="/auth/discord" className={buttonClasses("ghost", "md", "w-full")}>
        <Sprite name="icon-discord" scale={2} />
        Continue with Discord
      </a>
    );
  }
  return (
    <p className="flex min-h-11 w-full items-center justify-center gap-2 rounded-pill border-2 border-dashed border-wood-dark px-4 py-2 text-center font-display text-base font-semibold text-wood-dark">
      <Sprite name="icon-discord" scale={2} className="opacity-60" />
      Discord sign-in coming soon
    </p>
  );
}
