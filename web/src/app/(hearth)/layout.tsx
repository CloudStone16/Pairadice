import { Suspense, type ReactNode } from "react";
import { CampfirePanel, ShelfPanel } from "@/components/hearth/Panels";
import { HudBar } from "@/components/hearth/HudBar";
import { SignInGate } from "@/components/hearth/SignInGate";
import { SuspendedBanner } from "@/components/hearth/SuspendedBanner";
import { CampfireSkeleton, ShelfSkeleton } from "@/components/hearth/Skeletons";
import { getCurrentUser } from "@/lib/queries";

// Every page here reads the dev-user cookie and live MySQL data.
export const dynamic = "force-dynamic";

export default async function HearthLayout({ children }: { children: ReactNode }) {
  // Only the current user blocks the shell; the shelf and campfire stream in behind Suspense.
  const user = await getCurrentUser();
  if (!user) return <SignInGate />;

  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-pill bg-ember px-4 py-2 font-display font-semibold text-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>
      <HudBar user={user} />
      {user.presence === "suspended" ? <SuspendedBanner /> : null}
      <div className="mx-auto grid w-full max-w-[1680px] flex-1 grid-cols-1 content-start gap-x-8 gap-y-5 overflow-x-clip px-4 py-4 lg:gap-y-8 lg:py-8 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_18.75rem]">
        <aside aria-label="Game shelf" className="min-w-0 lg:row-span-2 xl:row-span-1">
          <Suspense fallback={<ShelfSkeleton />}>
            <ShelfPanel userId={user.user_id} />
          </Suspense>
        </aside>
        <main id="main" className="min-w-0 outline-none" tabIndex={-1}>
          {children}
        </main>
        <aside aria-label="Campfire" className="min-w-0 lg:col-start-2 xl:col-start-3">
          <Suspense fallback={<CampfireSkeleton />}>
            <CampfirePanel userId={user.user_id} />
          </Suspense>
        </aside>
      </div>
    </>
  );
}
