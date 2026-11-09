import type { Metadata } from "next";
import { QuestForm } from "@/components/quest/QuestForm";
import { SuspendedBanner } from "@/components/hearth/SuspendedBanner";
import { Sprite, Window } from "@/components/ui";
import { requireViewer } from "@/lib/auth/guards";
import { getHostAccounts, getQuestCatalog } from "@/lib/queries-quest";

export const metadata: Metadata = { title: "Host a quest | PairADice" };

export default async function NewQuestPage() {
  const viewer = await requireViewer("/camp/new");

  if (viewer.status !== "active") {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-3xl font-bold text-cream">Host a quest</h1>
        <SuspendedBanner />
      </div>
    );
  }

  const [catalog, accounts] = await Promise.all([getQuestCatalog(viewer), getHostAccounts(viewer)]);

  return (
    <Window variant="parchment" title="New quest" titleAs="p" landmark>
      <div className="mb-6 flex items-center gap-4">
        <Sprite name="icon-new-quest" scale={3} />
        <div>
          <h1 className="font-display text-3xl font-bold leading-tight">Host a quest</h1>
          <p className="text-wood-dark">Pin a notice to the board and gather your party.</p>
        </div>
      </div>
      <QuestForm catalog={catalog} accounts={accounts} />
    </Window>
  );
}
