import Link from "next/link";
import { Chip, Sprite, Window } from "@/components/ui";
import { retryDeadAction } from "@/app/(hearth)/admin/vector/actions";
import type { Kindred, LabPlayer, PipelineStatus, PlayerSource } from "@/lib/vector-lab";
import type { DocSummary } from "./types";
import { Sparkline } from "./Sparkline";
import { shortHash } from "./watch";

const WORKER_CMD = "node vector/scripts/worker.js --watch";
const STALE_SECONDS = 15;

export function Legend() {
  const items: Array<[string, string, string]> = [
    ["R", "Read", "Find players with similar interests (vector search)."],
    ["U", "Update", "Edit a bio in MySQL; the worker re-embeds it in MongoDB."],
    ["D", "Delete", "Ban a player; the worker deletes the document."],
    ["C", "Create", "Add a player (or restore one); a document appears."],
  ];
  return (
    <section aria-labelledby="legend-h">
      <h2 id="legend-h" className="sr-only">
        How to read this page
      </h2>
      <p className="mb-3 text-lavender">
        The flow: <strong className="text-cream">MySQL</strong> (the truth) fires a trigger, which writes a row to the{" "}
        <strong className="text-cream">outbox</strong> queue; the <strong className="text-cream">worker</strong> reads the queue
        and writes to <strong className="text-cream">MongoDB</strong>. This page only reads MongoDB.
      </p>
      <ol role="list" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {items.map(([k, name, text]) => (
          <li key={k} className="flex items-start gap-3 rounded-chip bg-plum p-3 ring-1 ring-inset ring-lavender/50">
            <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-pill bg-ember font-display font-bold text-ink">
              {k}
            </span>
            <span>
              <strong className="font-display">{name}.</strong> {text}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div>
      <dt className="text-sm text-lavender">{label}</dt>
      <dd className="font-display text-2xl font-bold">{value ?? "unreachable"}</dd>
    </div>
  );
}

export function StatusPanel({ status }: { status: PipelineStatus }) {
  const { mysql, mongo, backlog, dead } = status;
  const stale = backlog.oldestAgeSeconds !== null && backlog.oldestAgeSeconds > STALE_SECONDS;
  const sessionsSql = mysql.open + mysql.full + mysql.inProgress;
  return (
    <Window title="Pipeline status" variant="plum" landmark>
      <div className="flex flex-col gap-5">
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <h3 className="mb-2 font-display text-lg font-semibold">MySQL (source of truth)</h3>
            <dl className="grid grid-cols-2 gap-3">
              <Stat label="Players not banned" value={mysql.nonBanned} />
              <Stat label="Sessions open / full / in progress" value={`${mysql.open} / ${mysql.full} / ${mysql.inProgress}`} />
            </dl>
          </div>
          <div>
            <h3 className="mb-2 font-display text-lg font-semibold">MongoDB (derived copy)</h3>
            <dl className="grid grid-cols-2 gap-3">
              <Stat label="player_embeddings" value={mongo.players} />
              <Stat label="session_embeddings" value={mongo.sessions} />
            </dl>
          </div>
        </div>
        <p className="text-sm">
          {mongo.players === null ? (
            <>MongoDB is unreachable, so nothing below can be compared.</>
          ) : mongo.players === mysql.nonBanned && mongo.sessions === sessionsSql ? (
            <>
              <Sprite name="icon-accept" className="mr-1 inline-block align-middle" />
              The counts match: every eligible row has a document.
            </>
          ) : (
            <>The counts differ: the worker is behind, or a backfill is needed.</>
          )}{" "}
          Model: {mongo.model ?? "unknown"}, {mongo.dims ?? "?"} dimensions, vector search mode: Atlas $vectorSearch.
        </p>

        <div>
          <h3 className="mb-1 font-display text-lg font-semibold">Outbox backlog</h3>
          <p>
            {backlog.pending} pending row(s)
            {backlog.oldestAgeSeconds !== null ? `, oldest waiting ${backlog.oldestAgeSeconds.toFixed(1)} s` : ""}. Each row is a
            player or session the worker still has to sync.
          </p>
          {stale ? (
            <p role="alert" className="mt-2 rounded-chip bg-sfc-yellow px-3 py-2 font-semibold text-ink">
              <Sprite name="icon-warning" className="mr-1 inline-block align-middle" />
              The worker does not seem to be running. Start it with <code>{WORKER_CMD}</code> (needs MYSQL_* and MONGO_URI in the
              environment).
            </p>
          ) : null}
        </div>

        <div>
          <h3 className="mb-1 font-display text-lg font-semibold">Dead letters</h3>
          {dead.length === 0 ? (
            <p>None. Rows are dead after 5 failed attempts.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Outbox rows that failed 5 times (v_outbox_dead)</caption>
                  <thead>
                    <tr>
                      <th scope="col" className="py-1 pr-3">Entity</th>
                      <th scope="col" className="py-1 pr-3">Op</th>
                      <th scope="col" className="py-1 pr-3">Attempts</th>
                      <th scope="col" className="py-1">Last error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dead.map((d) => (
                      <tr key={`${d.entity}-${d.entityId}`} className="align-top">
                        <td className="py-1 pr-3">{d.entity} {d.entityId}</td>
                        <td className="py-1 pr-3">{d.op}</td>
                        <td className="py-1 pr-3">{d.attempts}</td>
                        <td className="py-1">{d.lastError ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <form action={retryDeadAction} className="mt-3">
                <button
                  type="submit"
                  className="min-h-10 rounded-pill bg-sfc-yellow px-5 font-display font-semibold text-ink shadow-key"
                >
                  Retry dead rows
                </button>
              </form>
            </>
          )}
        </div>
        <p className="text-sm">
          <Link href="/admin/vector" className="underline">Refresh these numbers</Link>
        </p>
      </div>
    </Window>
  );
}

export function PlayerPicker({ players, selected }: { players: LabPlayer[]; selected: number | null }) {
  return (
    <form method="get" action="/admin/vector" className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="lab-player" className="font-display font-semibold">
          Player to inspect
        </label>
        <select
          id="lab-player"
          name="player"
          defaultValue={selected ?? ""}
          className="min-h-11 rounded-chip border-2 border-ink bg-cream px-3 text-ink"
        >
          <option value="" disabled>
            Choose a player
          </option>
          {players.map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.userId} @{p.username} ({p.status})
            </option>
          ))}
        </select>
      </div>
      <button type="submit" className="min-h-11 rounded-pill bg-sfc-yellow px-5 font-display font-semibold text-ink shadow-key">
        <Sprite name="icon-eye" className="mr-1 inline-block align-middle" /> Inspect
      </button>
    </form>
  );
}

export function Inspector({ source, doc, mongoDown }: { source: PlayerSource; doc: DocSummary | null; mongoDown: boolean }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Window title="MySQL source" variant="parchment">
        <p className="mb-2 text-sm">What the worker reads for @{source.username}.</p>
        <dl className="flex flex-col gap-2">
          <Row k="status" v={<Chip tone={source.status === "banned" ? "red" : "green"}>{source.status}</Chip>} />
          <Row k="bio" v={source.bio || "(empty)"} />
          <Row k="tags" v={source.tags.length ? source.tags.map((t) => t.name).join(", ") : "(none)"} />
          <Row
            k="games, modes, roles"
            v={
              source.games.length ? (
                <ul role="list">
                  {source.games.map((g) => (
                    <li key={g.game}>
                      {g.game}: {g.modes.join(", ") || "no modes"}; plays {g.roles.join(", ") || "no roles"}
                    </li>
                  ))}
                </ul>
              ) : (
                "(none)"
              )
            }
          />
        </dl>
        <p className="mt-2 text-sm">Rank and region are not embedded: SQL scores those.</p>
      </Window>
      <Window title="MongoDB document" variant="parchment">
        {mongoDown ? (
          <p>MongoDB is unreachable.</p>
        ) : !doc ? (
          <p className="font-semibold">No document.{source.status === "banned" ? " Banned players are removed from MongoDB." : " The worker has not embedded this player yet."}</p>
        ) : (
          <>
            <p className="mb-2 text-sm">Written by the worker, read here.</p>
            <dl className="flex flex-col gap-2">
              <Row k="source_text" v={doc.sourceText} />
              <Row k="source_hash" v={<code>{shortHash(doc.sourceHash)}</code>} />
              <Row k="model" v={`${doc.model}, ${doc.dims} dimensions`} />
              <Row k="embedded_at" v={doc.embeddedAt ?? "none"} />
              <Row k="updated_at" v={doc.updatedAt ?? "none"} />
              <Row k="embedding" v={<Sparkline values={doc.head} total={doc.dims} />} />
            </dl>
          </>
        )}
      </Window>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div>
      <dt className="font-display text-sm font-semibold">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

export function KindredPanel({ kindred, username }: { kindred: Kindred | null; username: string }) {
  return (
    <Window title="R  Read: kindred spirits" variant="parchment">
      {!kindred ? (
        <p>No similarity results: this player has no document (or MongoDB is unreachable).</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="font-display text-lg font-semibold">Players like @{username}</h3>
            <p className="mb-2 text-sm">Nearest vectors; the score is (1 + cosine) / 2.</p>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Top 5 similar players</caption>
              <thead>
                <tr>
                  <th scope="col" className="py-1 pr-2">Player</th>
                  <th scope="col" className="py-1 pr-2">Score</th>
                  <th scope="col" className="py-1">Their source_text</th>
                </tr>
              </thead>
              <tbody>
                {kindred.players.map((p) => (
                  <tr key={p.id} className="align-top">
                    <th scope="row" className="py-1 pr-2 font-normal">@{p.username}</th>
                    <td className="py-1 pr-2 font-mono">{p.score.toFixed(3)}</td>
                    <td className="py-1">{p.sourceText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold">Open public sessions that fit</h3>
            <p className="mb-2 text-sm">Same vector against session documents.</p>
            {kindred.sessions.length === 0 ? (
              <p>No matching sessions.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Top 3 similar sessions</caption>
                <thead>
                  <tr>
                    <th scope="col" className="py-1 pr-2">Session</th>
                    <th scope="col" className="py-1 pr-2">Score</th>
                    <th scope="col" className="py-1">source_text</th>
                  </tr>
                </thead>
                <tbody>
                  {kindred.sessions.map((s) => (
                    <tr key={s.id} className="align-top">
                      <th scope="row" className="py-1 pr-2 font-normal">#{s.id}</th>
                      <td className="py-1 pr-2 font-mono">{s.score.toFixed(3)}</td>
                      <td className="py-1">{s.sourceText}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </Window>
  );
}
