"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, PendingButton, Sprite, Window } from "@/components/ui";
import {
  banPlayerAction,
  createDemoPlayerAction,
  restorePlayerAction,
  updatePlayerAction,
} from "@/app/(hearth)/admin/vector/actions";
import type { LabResult, OutboxRow, Snapshot, WatchKind } from "./types";
import { GIVE_UP_MS, POLL_MS, isDone, shortHash } from "./watch";

export interface LabPlayerView {
  userId: number;
  username: string;
  status: "active" | "suspended" | "banned";
  bio: string;
  tagIds: number[];
  /** Why this player may not be banned (admin or yourself), or null. */
  protectedReason: string | null;
}

interface Watch {
  kind: WatchKind;
  userId: number;
  username: string;
  before: Snapshot;
  outbox: OutboxRow | null;
  note: string;
  startedAt: number;
  state: "waiting" | "done" | "timeout";
  latest: Snapshot | null;
  elapsed: number;
  /** Consecutive snapshot requests that failed (network or non-2xx). */
  failures: number;
}

const KIND_LABEL: Record<WatchKind, string> = {
  update: "UPDATE: re-embed",
  ban: "DELETE: remove the document",
  restore: "CREATE: document comes back",
  create: "CREATE: new document",
};

export function LabActions({ player, tags }: { player: LabPlayerView | null; tags: Array<{ tagId: number; name: string }> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const [watch, setWatch] = useState<Watch | null>(null);
  const [confirmBan, setConfirmBan] = useState(false);
  // what the poller needs, set from event handlers (never during render)
  const statusRef = useRef<HTMLParagraphElement>(null);
  const banBox = useRef<HTMLDivElement>(null);
  // where focus goes when the confirm step closes: back to the trigger (cancel) or to the status (done)
  const afterConfirm = useRef<"trigger" | "status">("trigger");
  const wasConfirming = useRef(false);
  const cfgRef = useRef<Pick<Watch, "kind" | "userId" | "before" | "startedAt"> | null>(null);

  // ---- polling: every 2 s until the document reaches the expected state, or 60 s pass
  useEffect(() => {
    if (confirmBan) banBox.current?.querySelector<HTMLElement>("[data-no]")?.focus();
    else if (wasConfirming.current && afterConfirm.current === "trigger") {
      banBox.current?.querySelector<HTMLElement>("[data-trigger]")?.focus();
    }
    wasConfirming.current = confirmBan;
  }, [confirmBan]);

  const waiting = watch?.state === "waiting";
  const startedAt = watch?.startedAt;
  useEffect(() => {
    if (!waiting || startedAt === undefined) return;
    let stopped = false;
    let failures = 0;
    const controller = new AbortController();
    const patch = (p: Partial<Watch>) => setWatch((w) => (w && w.startedAt === startedAt ? { ...w, ...p } : w));
    const tick = async () => {
      const cur = cfgRef.current;
      if (stopped || !cur || cur.startedAt !== startedAt) return;
      const elapsed = Date.now() - cur.startedAt;
      let snap: Snapshot | null = null;
      try {
        const res = await fetch(`/api/admin/vector/snapshot?user=${cur.userId}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (res.ok) snap = (await res.json()) as Snapshot;
      } catch {
        snap = null;
      }
      if (stopped) return;
      const before = failures;
      failures = snap ? 0 : failures + 1;
      if (failures === 1 && before === 0) setAnnounce("Snapshot unavailable. Still trying every 2 seconds.");
      else if (failures === 0 && before > 0) setAnnounce("Snapshot is available again.");
      if (snap && isDone(cur.kind, cur.before, snap)) {
        stopped = true;
        patch({ state: "done", latest: snap, elapsed, failures: 0 });
        setAnnounce(`MongoDB caught up after ${(elapsed / 1000).toFixed(1)} seconds.`);
        router.refresh();
      } else if (elapsed >= GIVE_UP_MS) {
        stopped = true;
        patch({ state: "timeout", ...(snap ? { latest: snap } : {}), elapsed, failures });
        setAnnounce("Gave up after 60 seconds. The worker may not be running.");
      } else {
        patch({ ...(snap ? { latest: snap } : {}), elapsed, failures });
      }
    };
    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [waiting, startedAt, router]);

  const begin = useCallback(
    (kind: WatchKind, username: string, res: LabResult) => {
      if (!res.ok) {
        setError(res.message);
        setAnnounce(res.message);
        return;
      }
      setError(null);
      afterConfirm.current = "status";
      setConfirmBan(false);
      // the confirm step is about to unmount: hand focus to the status region, which stays mounted
      if (kind === "ban") statusRef.current?.focus();
      const startedAt = Date.now();
      cfgRef.current = { kind, userId: res.userId, before: res.before, startedAt };
      setWatch({
        kind,
        userId: res.userId,
        username,
        before: res.before,
        outbox: res.outbox,
        note: res.note,
        startedAt,
        state: "waiting",
        latest: null,
        elapsed: 0,
        failures: 0,
      });
      setAnnounce(`${res.note} Waiting for the worker.`);
      if (kind === "create") router.replace(`/admin/vector?player=${res.userId}`);
      else router.refresh();
    },
    [router],
  );

  const cancelConfirm = () => {
    afterConfirm.current = "trigger";
    setConfirmBan(false);
  };

  const run = (kind: WatchKind, username: string, fn: () => Promise<LabResult>) =>
    startTransition(async () => {
      begin(kind, username, await fn());
    });

  return (
    <div className="flex flex-col gap-8">
      <p
        ref={statusRef}
        role="status"
        aria-live="polite"
        tabIndex={-1}
        className="sr-only focus:not-sr-only focus:rounded-chip focus:bg-ink/60 focus:px-3 focus:py-2"
      >
        {announce}
      </p>

      {error ? (
        <p role="alert" className="rounded-chip bg-sfc-red px-4 py-2 font-semibold text-ink">
          {error}
        </p>
      ) : null}

      <div ref={banBox} className="grid gap-8 xl:grid-cols-2">
        <Window title="U  Update bio and tags" variant="parchment" className="xl:col-span-2">
          {player && player.status !== "banned" ? (
            <EditForm
              key={`${player.userId}:${player.bio}:${player.tagIds.join(",")}`}
              player={player}
              tags={tags}
              busy={pending}
              onSave={(bio, tagIds) =>
                run("update", `@${player.username}`, () => updatePlayerAction(player.userId, bio, tagIds))
              }
            />
          ) : (
            <p>{player ? "This player is banned. Restore them below to edit." : "Pick a player above first."}</p>
          )}
        </Window>

        <Window title="D  Delete (ban) and restore" variant="parchment">
          <p className="mb-3">
            Banning sets <code>users.status = &apos;banned&apos;</code>. A trigger queues a <strong>delete</strong>; the worker
            removes the document. Restoring queues an <strong>upsert</strong> and the document returns.
          </p>
          {!player ? (
            <p>Pick a player above first.</p>
          ) : player.status === "banned" ? (
            <PendingButton
              variant="green"
              pending={pending}
              pendingLabel="Restoring"
              onClick={() => run("restore", `@${player.username}`, () => restorePlayerAction(player.userId))}
            >
              <Sprite name="icon-accept" /> Restore @{player.username}
            </PendingButton>
          ) : player.protectedReason ? (
            <p className="font-semibold">
              <Sprite name="icon-lock" className="mr-1 inline-block align-middle" /> {player.protectedReason}
            </p>
          ) : confirmBan ? (
            <div
              role="group"
              aria-label="Confirm ban"
              className="flex flex-col gap-3"
              onKeyDown={(e) => {
                if (e.key === "Escape") cancelConfirm();
              }}
            >
              <p className="font-semibold">Really ban @{player.username}? Their document will be deleted from MongoDB.</p>
              <div className="flex flex-wrap gap-3">
                <PendingButton
                  variant="red"
                  pending={pending}
                  pendingLabel="Banning"
                  onClick={() => run("ban", `@${player.username}`, () => banPlayerAction(player.userId))}
                >
                  <Sprite name="icon-decline" /> Yes, ban
                </PendingButton>
                <Button data-no="" variant="ghost" aria-disabled={pending ? true : undefined} onClick={() => !pending && cancelConfirm()}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <PendingButton
              data-trigger=""
              variant="red"
              pending={pending}
              pendingLabel="Working"
              onClick={() => {
                afterConfirm.current = "trigger";
                setConfirmBan(true);
              }}
            >
              <Sprite name="icon-decline" /> Ban @{player.username}
            </PendingButton>
          )}
        </Window>

        <Window title="C  Create a demo player" variant="parchment">
          <p className="mb-3">
            Registers <code>lab_xxxx</code> through <code>sp_register_user</code> (random password, never shown), sets a
            bio and two tags, then waits for the new document.
          </p>
          <PendingButton
            variant="green"
            pending={pending}
            pendingLabel="Creating a demo player"
            onClick={() => run("create", "the new demo player", () => createDemoPlayerAction())}
          >
            <Sprite name="icon-sparkle" /> Create a demo player
          </PendingButton>
        </Window>
      </div>

      {watch ? <WatchPanel watch={watch} /> : null}
    </div>
  );
}

function EditForm({
  player,
  tags,
  busy,
  onSave,
}: {
  player: LabPlayerView;
  tags: Array<{ tagId: number; name: string }>;
  busy: boolean;
  onSave: (bio: string, tagIds: number[]) => void;
}) {
  const [bio, setBio] = useState(player.bio);
  const [picked, setPicked] = useState<Set<number>>(new Set(player.tagIds));
  const bioId = useId();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(bio, [...picked]);
      }}
    >
      <p>
        Editing <strong>@{player.username}</strong>. Saving writes <code>users.bio</code> and <code>user_tag</code> in MySQL
        through the admin login; triggers queue the re-embed. Nothing is written to MongoDB from this page.
      </p>
      <div className="flex flex-col gap-1">
        <label htmlFor={bioId} className="font-display font-semibold">
          Bio <span className="font-body text-sm font-normal">({bio.length}/600)</span>
        </label>
        <textarea
          id={bioId}
          value={bio}
          maxLength={600}
          rows={4}
          onChange={(e) => setBio(e.target.value)}
          className="rounded-chip border-2 border-ink bg-cream p-2 text-ink"
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="font-display font-semibold">Tags</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {tags.map((t) => (
            <label key={t.tagId} className="flex min-h-8 items-center gap-2">
              <input
                type="checkbox"
                checked={picked.has(t.tagId)}
                onChange={(e) =>
                  setPicked((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(t.tagId);
                    else next.delete(t.tagId);
                    return next;
                  })
                }
                className="size-5 accent-[var(--color-plum-2)]"
              />
              {t.name}
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <PendingButton type="submit" variant="yellow" pending={busy} pendingLabel="Saving">
          <Sprite name="icon-scroll" /> Save to MySQL
        </PendingButton>
      </div>
    </form>
  );
}

function WatchPanel({ watch }: { watch: Watch }) {
  const secs = Math.floor(watch.elapsed / 1000);
  const outboxNow = watch.latest ? watch.latest.outbox : watch.outbox;
  const { before } = watch;
  const after = watch.state === "done" ? watch.latest : null;
  return (
    <Window title={`Watching: ${KIND_LABEL[watch.kind]}`} variant="plum" landmark>
      <div className="flex flex-col gap-4">
        <p>
          {watch.note} Player <strong>{watch.username}</strong> (id {watch.userId}).
        </p>

        <div>
          <h3 className="font-display text-lg font-semibold">1. The outbox row MySQL queued</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">embedding_outbox row for this player</caption>
              <thead>
                <tr>
                  <th scope="col" className="py-1 pr-4">entity</th>
                  <th scope="col" className="py-1 pr-4">op</th>
                  <th scope="col" className="py-1 pr-4">enqueued_at (UTC)</th>
                  <th scope="col" className="py-1 pr-4">attempts</th>
                </tr>
              </thead>
              <tbody>
                {watch.outbox ? (
                  <tr>
                    <td className="py-1 pr-4">{watch.outbox.entity} {watch.outbox.entityId}</td>
                    <td className="py-1 pr-4">{watch.outbox.op}</td>
                    <td className="py-1 pr-4">{watch.outbox.enqueuedAt}</td>
                    <td className="py-1 pr-4">{watch.outbox.attempts}</td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={4} className="py-1">No row: the worker had already drained it.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-sm">
            Now: {outboxNow ? `still queued (attempts ${outboxNow.attempts})` : "row removed, the worker has processed it"}.
          </p>
        </div>

        <div>
          <h3 className="font-display text-lg font-semibold">2. The worker updates MongoDB</h3>
          {watch.state === "waiting" ? (
            <p>
              <Sprite name="icon-hourglass" className="mr-1 inline-block align-middle motion-safe:animate-pulse" />
              Polling every 2 s, {secs} s so far (gives up at 60 s).
              {watch.failures > 0 ? (
                <strong className="ml-1">Snapshot unavailable ({watch.failures} failed in a row), still trying.</strong>
              ) : null}
            </p>
          ) : watch.state === "done" ? (
            <p className="font-semibold">
              <Sprite name="icon-accept" className="mr-1 inline-block align-middle" />
              MongoDB caught up after {(watch.elapsed / 1000).toFixed(1)} s.
            </p>
          ) : (
            <p className="font-semibold">
              <Sprite name="icon-warning" className="mr-1 inline-block align-middle" />
              Still unchanged after 60 s. Start the worker: <code>node vector/scripts/worker.js --watch</code>
            </p>
          )}
        </div>

        {after ? <BeforeAfter before={before} after={after} /> : null}
      </div>
    </Window>
  );
}

function BeforeAfter({ before, after }: { before: Snapshot; after: Snapshot }) {
  const b = before.doc;
  const a = after.doc;
  const rows: Array<[string, string, string]> = [
    ["source_text", b?.sourceText ?? "No document", a?.sourceText ?? "No document"],
    ["source_hash", shortHash(b?.sourceHash), shortHash(a?.sourceHash)],
    ["embedded_at", b?.embeddedAt ?? "none", a?.embeddedAt ?? "none"],
    ["updated_at", b?.updatedAt ?? "none", a?.updatedAt ?? "none"],
  ];
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-display text-lg font-semibold">3. Before and after</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">MongoDB document before and after</caption>
          <thead>
            <tr>
              <th scope="col" className="py-1 pr-4">Field</th>
              <th scope="col" className="py-1 pr-4">Before</th>
              <th scope="col" className="py-1">After</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([f, x, y]) => (
              <tr key={f} className="align-top">
                <th scope="row" className="py-1 pr-4 font-mono font-normal">{f}</th>
                <td className="py-1 pr-4">{x}</td>
                <td className="py-1">{y}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <KindredList title="Kindred spirits before" items={before.kindred} />
        <KindredList title="Kindred spirits after" items={after.kindred} />
      </div>
    </div>
  );
}

function KindredList({ title, items }: { title: string; items: Snapshot["kindred"] }) {
  return (
    <div>
      <h4 className="font-display font-semibold">{title}</h4>
      {items.length === 0 ? (
        <p className="text-sm">None (no document).</p>
      ) : (
        <ol className="list-decimal pl-5 text-sm">
          {items.map((k) => (
            <li key={k.id}>
              @{k.username} <span className="font-mono">{k.score.toFixed(3)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
