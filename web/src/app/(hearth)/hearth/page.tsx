import type { Metadata } from "next";
import { Suspense } from "react";
import { EmptyState } from "@/components/hearth/EmptyState";
import { QuestGrid } from "@/components/hearth/QuestGrid";
import { RecentDms } from "@/components/hearth/RecentDms";
import { SignInGate } from "@/components/hearth/SignInGate";
import { ListSkeleton } from "@/components/hearth/Skeletons";
import { Sprite, Window } from "@/components/ui";
import { getCurrentUser, getRecentDms, getRecommendedQuests } from "@/lib/queries";

export const metadata: Metadata = { title: "Hearth | PairADice" };

/** Recommendations and recent DMs stream in behind their own Suspense boundary. */
async function HearthFeed({ userId, timeZone }: { userId: number; timeZone: string }) {
  const [quests, dms] = await Promise.all([getRecommendedQuests(userId), getRecentDms(userId)]);
  return (
    <>
      <Window title="Recommended for you" landmark>
        {quests.length === 0 ? (
          <EmptyState title="No matches just yet" sprite="icon-scroll">
            Nothing on the board fits your ranks, region and languages right now. New quests are posted all
            the time.
          </EmptyState>
        ) : (
          <QuestGrid quests={quests} timeZone={timeZone} />
        )}
      </Window>

      <RecentDms threads={dms} timeZone={timeZone} />
    </>
  );
}

export default async function HearthPage() {
  const user = await getCurrentUser();
  if (!user) return <SignInGate />;

  return (
    <div className="flex flex-col gap-10">
      {/* a cabin window at night: sky and stars above, floorboards below, the mascot standing on them */}
      <Window contentClassName="!p-0 overflow-hidden rounded-[8px]">
        <div className="relative overflow-hidden rounded-[8px] bg-gradient-to-b from-night via-dusk to-plum">
          {/* decorations only exist from sm up and live inside the right-hand safe zone the text keeps clear of */}
          <Sprite name="deco-moon" scale={3} className="absolute right-6 top-3 hidden opacity-90 sm:block" />
          <Sprite name="deco-star" scale={2} className="absolute right-28 top-12 hidden opacity-80 sm:block" />
          <Sprite name="deco-star" scale={1} className="absolute right-40 top-4 hidden opacity-70 md:block" />
          <Sprite name="deco-star" scale={1} className="absolute right-20 top-24 hidden opacity-60 lg:block" />

          <div className="relative px-5 pb-28 pt-8 sm:min-h-40 sm:px-8 sm:pb-8 sm:pr-48">
            <h1 className="font-display text-3xl font-bold leading-tight [overflow-wrap:anywhere] [text-shadow:0_2px_0_var(--color-ink)]">
              Welcome back, {user.display_name}
            </h1>
            <p className="mt-1 max-w-prose text-lavender">
              The fire is lit and the kettle is warm. Pull up a log and see who needs a fourth.
            </p>
          </div>

          {/* floorboards; the text above never sits on the tile */}
          <div aria-hidden="true" className="relative h-10 border-t-4 border-ink bg-plank">
            <Sprite
              name="dice-32"
              scale={3}
              className="absolute bottom-[calc(100%-10px)] right-6 motion-safe:animate-float"
            />
          </div>
        </div>
      </Window>

      <Suspense fallback={<ListSkeleton />}>
        <HearthFeed userId={user.user_id} timeZone={user.timezone} />
      </Suspense>
    </div>
  );
}
