import type { Metadata } from "next";
import { Window } from "@/components/ui";
import { requireRole } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Guild Hall | PairADice" };

export default async function ModPage() {
  const viewer = await requireRole("moderator", "/mod");
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-3xl font-bold [text-shadow:0_2px_0_var(--color-ink)]">Guild Hall</h1>
        <p className="text-lavender">Moderation tools.</p>
      </header>
      <Window title="Coming in Phase 6" variant="parchment">
        <p>The Guild Hall arrives in Phase 6.</p>
        <p>
          Signed in as {viewer.displayName} (@{viewer.username}). Roles: {viewer.roles.join(", ") || "none"}.
        </p>
      </Window>
    </div>
  );
}
