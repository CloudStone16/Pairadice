"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sprite, Window } from "@/components/ui";
import { cartSprite } from "@/lib/format";
import type { Quest } from "@/lib/types";

/**
 * Three quick recommendations under the fire. The Hearth already shows the full
 * Recommended grid, so the panel steps aside there instead of repeating it.
 */
export function QuickPicks({ recommended }: { recommended: Quest[] }) {
  const pathname = usePathname();
  if (pathname === "/hearth") return null;

  return (
    <Window title="Quick picks" variant="parchment">
      {recommended.length === 0 ? (
        <p className="text-sm text-wood-dark">No matches yet. Check back after supper.</p>
      ) : (
        <ul role="list" className="space-y-1">
          {recommended.map((q) => (
            <li key={q.session_id}>
              <Link
                href={`/camp/${q.session_id}`}
                className="flex items-center gap-3 rounded-frame p-2 transition hover:bg-parchment-dark"
              >
                <Sprite name={cartSprite(q.game_slug)} />
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="line-clamp-2 block font-display text-sm font-semibold [overflow-wrap:anywhere]">
                    {q.title}
                  </span>
                  <span className="line-clamp-2 block text-sm text-wood-dark [overflow-wrap:anywhere]">
                    {q.game} &middot; {q.game_mode} &middot; {q.current_players}/{q.max_players}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Window>
  );
}
