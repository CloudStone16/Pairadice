import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guards";
import {
  getKindred,
  getPipelineStatus,
  getPlayerDoc,
  getPlayerSource,
  listPlayers,
  listTags,
} from "@/lib/vector-lab";
import { Inspector, KindredPanel, Legend, PlayerPicker, StatusPanel } from "@/components/lab/LabPanels";
import { LabActions, type LabPlayerView } from "@/components/lab/LabActions";

export const metadata: Metadata = { title: "Vector Lab | PairADice" };

export default async function VectorLabPage({ searchParams }: { searchParams: Promise<{ player?: string | string[] }> }) {
  const viewer = await requireRole("admin", "/admin/vector");
  const raw = (await searchParams).player;
  const first = Array.isArray(raw) ? raw[0] : raw;
  const selected = first && /^\d{1,12}$/.test(first) ? Number(first) : null;

  const [status, players, tags, source] = await Promise.all([
    getPipelineStatus(),
    listPlayers(),
    listTags(),
    selected ? getPlayerSource(selected) : Promise.resolve(null),
  ]);

  let doc = null;
  let mongoDown = false;
  let kindred = null;
  if (source) {
    try {
      doc = await getPlayerDoc(source.userId);
    } catch {
      mongoDown = true;
    }
    if (doc) kindred = await getKindred(source.userId);
  }

  const target = players.find((p) => p.userId === source?.userId);
  const view: LabPlayerView | null = source
    ? {
        userId: source.userId,
        username: source.username,
        status: source.status,
        bio: source.bio,
        tagIds: source.tags.map((t) => t.tagId),
        protectedReason:
          source.userId === viewer.userId ? "You cannot ban yourself." : target?.isAdmin ? "Admins cannot be banned from here." : null,
      }
    : null;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-3xl font-bold [text-shadow:0_2px_0_var(--color-ink)]">Vector Lab</h1>
        <p className="text-lavender">
          Watch an edit travel from MySQL to MongoDB, step by step. Signed in as {viewer.displayName} (admin).
        </p>
        <Legend />
      </header>

      <StatusPanel status={status} />

      <section aria-labelledby="inspect-h" className="flex flex-col gap-5">
        <h2 id="inspect-h" className="font-display text-2xl font-bold">
          Player inspector
        </h2>
        <PlayerPicker players={players} selected={selected} />
        {selected && !source ? <p role="alert">No player with id {selected}.</p> : null}
        {source ? <Inspector source={source} doc={doc} mongoDown={mongoDown} /> : null}
      </section>

      {source ? <KindredPanel kindred={kindred} username={source.username} /> : null}

      <section aria-labelledby="act-h" className="flex flex-col gap-5">
        <h2 id="act-h" className="font-display text-2xl font-bold">
          Make a change and watch it sync
        </h2>
        <LabActions player={view} tags={tags} />
      </section>
    </div>
  );
}
