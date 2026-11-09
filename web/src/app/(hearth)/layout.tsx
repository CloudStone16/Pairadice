import { Suspense, type ReactNode } from "react";
import { CampfirePanel, ShelfPanel } from "@/components/hearth/Panels";
import { HudBar } from "@/components/hearth/HudBar";
import { SuspendedBanner } from "@/components/hearth/SuspendedBanner";
import { CampfireSkeleton, ShelfSkeleton } from "@/components/hearth/Skeletons";
import { getViewer, getViewerUser } from "@/lib/auth/guards";
import type { Session } from "@/lib/auth/session";
import type { UserLite } from "@/lib/types";

// Every page here reads the session cookie and live MySQL data.
export const dynamic = "force-dynamic";

/** HUD identity built from the session alone, for the rare case where the users row cannot be read. */
function userFromSession(session: Session): UserLite {
  return {
    user_id: session.userId,
    username: session.username,
    display_name: session.displayName,
    timezone: "UTC",
    trust_score: 0,
    presence: session.status === "suspended" ? "suspended" : "online",
  };
}

export default async function HearthLayout({ children }: { children: ReactNode }) {
  // Only the current user blocks the shell; the shelf and campfire stream in behind Suspense.
  // Signed-out visitors may browse the public pages: the shelf then shows public quests only (viewer
  // id 0 is the "no viewer" sentinel at the component boundary) and the campfire is omitted.
  // The panels pick their DB login from the request session (see lib/viewer-role.ts).
  const session = await getViewer();
  let user = session ? await getViewerUser() : null;
  if (session && !user) {
    console.warn("[hearth] session without a readable user row; rendering the HUD from the session");
    user = userFromSession(session);
  }
  const viewerId = session?.userId ?? 0;

  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-pill bg-ember px-4 py-2 font-display font-semibold text-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <HudBar user={user} session={session} />
      {session?.status === "suspended" ? <SuspendedBanner /> : null}
      <div
        className={`mx-auto grid w-full max-w-[1680px] flex-1 grid-cols-1 content-start gap-x-8 gap-y-5 overflow-x-clip px-4 py-4 lg:gap-y-8 lg:py-8 lg:grid-cols-[15rem_minmax(0,1fr)] ${
          session ? "xl:grid-cols-[15rem_minmax(0,1fr)_18.75rem]" : ""
        }`}
      >
        <aside aria-label="Game shelf" className="min-w-0 lg:row-span-2 xl:row-span-1">
          <Suspense fallback={<ShelfSkeleton />}>
            <ShelfPanel userId={viewerId} />
          </Suspense>
        </aside>
        <main id="main" className="min-w-0 outline-none" tabIndex={-1}>
          {children}
        </main>
        {session ? (
          <aside aria-label="Campfire" className="min-w-0 lg:col-start-2 xl:col-start-3">
            <Suspense fallback={<CampfireSkeleton />}>
              <CampfirePanel userId={session.userId} />
            </Suspense>
          </aside>
        ) : null}
      </div>
    </>
  );
}
