"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { hostQuest } from "@/app/(hearth)/camp/new/actions";
import { Button, Sprite } from "@/components/ui";
import { languageName } from "@/lib/format";
import { CheckRow, Field, Group, ariaFor, controlClasses } from "./Field";
import {
  initialQuestState,
  roleSpriteName,
  type HostAccount,
  type QuestCatalog,
  type QuestField,
} from "./types";

const STEPS = [
  { id: "step-game", label: "Game" },
  { id: "step-roles", label: "Roles" },
  { id: "step-rules", label: "Rules" },
  { id: "step-when", label: "Schedule" },
];

const FIELD_ANCHOR: Record<QuestField, string> = {
  title: "title",
  description: "description",
  game: "game",
  mode: "mode",
  platform: "platform",
  region: "region",
  maxPlayers: "maxPlayers",
  roles: "roles",
  hostRole: "hostRole",
  hostAccount: "hostAccount",
  languages: "languages",
  tags: "tags",
  visibility: "visibility",
  joinPolicy: "joinPolicy",
  rankRange: "minRank",
  minRating: "minRating",
  scheduledStart: "scheduledStart",
};

function StepTitle({ n, children }: { n: number; children: string }) {
  return (
    <h2 className="mb-3 flex items-center gap-2 border-b-2 border-wood/40 pb-2 font-display text-xl font-bold text-ink">
      <span aria-hidden="true" className="grid size-7 place-items-center rounded-pill bg-ink text-base text-cream">
        {n}
      </span>
      {children}
    </h2>
  );
}

export function QuestForm({
  catalog,
  accounts,
}: {
  catalog: QuestCatalog;
  accounts: HostAccount[] | null;
}) {
  const [state, action, pending] = useActionState(hostQuest, initialQuestState);
  const fe = state.fieldErrors ?? {};
  const raw = state.values ?? {};
  const str = (k: string, fallback = "") => {
    const v = raw[k];
    return (Array.isArray(v) ? v[0] : v) ?? fallback;
  };
  const list = (k: string) => {
    const v = raw[k];
    return Array.isArray(v) ? v : v ? [v] : [];
  };

  const [gameId, setGameId] = useState(str("game"));
  const [modeId, setModeId] = useState(str("mode"));
  const [platformId, setPlatformId] = useState(str("platform"));
  const [maxPlayers, setMaxPlayers] = useState(str("maxPlayers", "4"));
  const [needs, setNeeds] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) if (k.startsWith("need_") && typeof v === "string") o[k] = v;
    return o;
  });
  const [start, setStart] = useState(str("scheduledStart"));

  const game = catalog.games.find((g) => String(g.game_id) === gameId);
  const modes = catalog.modes.filter((m) => String(m.game_id) === gameId);
  const mode = modes.find((m) => String(m.mode_id) === modeId);
  const roles = catalog.roles.filter((r) => String(r.game_id) === gameId);
  const ranks = catalog.ranks.filter((r) => String(r.game_id) === gameId);
  const platforms = catalog.platforms.filter((p) => String(p.game_id) === gameId);
  const myAccounts = accounts?.filter((a) => String(a.platform_id) === platformId) ?? [];
  const tzOffset = start ? String(new Date(start).getTimezoneOffset()) : "";
  const needed = roles.reduce((n, r) => n + (Number(needs[`need_${r.game_role_id}`]) || 0), 0);
  const seats = Number(maxPlayers) || 0;
  const defaultLangs = state.status === "idle" ? ["en"] : list("languages");

  const summaryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state.status === "error") summaryRef.current?.focus();
  }, [state]);

  const errorEntries = Object.entries(fe) as Array<[QuestField, string]>;

  function onGame(id: string) {
    setGameId(id);
    setModeId("");
    setPlatformId("");
    setNeeds({});
  }
  function onMode(id: string) {
    setModeId(id);
    const m = modes.find((x) => String(x.mode_id) === id);
    if (m) setMaxPlayers(String(m.max_team_size));
  }

  return (
    <form action={action} noValidate className="flex flex-col gap-8">
      <nav aria-label="Quest steps">
        <ol role="list" className="flex flex-wrap gap-2">
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-pill bg-parchment-dark px-3 py-1 text-[15px] font-semibold text-ink ring-1 ring-wood/50 hover:bg-parchment-dark/70"
              >
                <span aria-hidden="true" className="grid size-6 place-items-center rounded-pill bg-ink text-sm text-cream">
                  {i + 1}
                </span>
                {s.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div ref={summaryRef} role="alert" tabIndex={-1} className={state.status === "error" ? "" : "hidden"}>
        {state.status === "error" ? (
          <div className="rounded-frame border-2 border-[#8a2621] bg-[#fff1ec] p-3 text-[15px] text-[#6e1c18]">
            <p className="flex items-start gap-2 font-semibold">
              <Sprite name="icon-warning" className="mt-0.5" />
              <span>{state.message ?? "Something went wrong, please try again."}</span>
            </p>
            {errorEntries.length > 0 ? (
              <ul role="list" className="mt-2 list-disc pl-10">
                {errorEntries.map(([f, msg]) => (
                  <li key={f}>
                    <a href={`#${FIELD_ANCHOR[f]}`} className="underline underline-offset-2">
                      {msg}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* 1. Game */}
      <fieldset id="step-game" className="flex min-w-0 flex-col gap-4 scroll-mt-24">
        <legend className="sr-only">Step 1: Game and mode</legend>
        <StepTitle n={1}>Pick your game</StepTitle>
        <Field id="title" label="Quest title" error={fe.title} hint="3 to 120 characters, like 'Bedwars night, chill vibes'.">
          <input id="title" name="title" required maxLength={120} defaultValue={str("title")} className={controlClasses} {...ariaFor("title", { hint: "x", error: fe.title })} />
        </Field>
        <Field id="description" label="Description" optional error={fe.description}>
          <textarea id="description" name="description" rows={3} maxLength={2000} defaultValue={str("description")} className={controlClasses} {...ariaFor("description", { error: fe.description })} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="game" label="Game" error={fe.game}>
            <select id="game" name="game" required value={gameId} onChange={(e) => onGame(e.target.value)} className={controlClasses} {...ariaFor("game", { error: fe.game })}>
              <option value="">Choose a game</option>
              {catalog.games.map((g) => (
                <option key={g.game_id} value={g.game_id}>{g.name}</option>
              ))}
            </select>
          </Field>
          <Field id="mode" label="Mode" error={fe.mode}>
            <select id="mode" name="mode" required value={modeId} onChange={(e) => onMode(e.target.value)} disabled={!game} className={controlClasses} {...ariaFor("mode", { error: fe.mode })}>
              <option value="">{game ? "Choose a mode" : "Pick a game first"}</option>
              {modes.map((m) => (
                <option key={m.mode_id} value={m.mode_id}>{m.name}</option>
              ))}
            </select>
          </Field>
          <Field id="platform" label="Platform" error={fe.platform}>
            <select id="platform" name="platform" required value={platformId} onChange={(e) => setPlatformId(e.target.value)} disabled={!game} className={controlClasses} {...ariaFor("platform", { error: fe.platform })}>
              <option value="">{game ? "Choose a platform" : "Pick a game first"}</option>
              {platforms.map((p) => (
                <option key={p.platform_id} value={p.platform_id}>{p.name}</option>
              ))}
            </select>
          </Field>
          <Field
            id="maxPlayers"
            label="Party size"
            error={fe.maxPlayers}
            hint={mode ? `${mode.name}: ${mode.min_team_size === mode.max_team_size ? mode.max_team_size : `${mode.min_team_size} to ${mode.max_team_size}`} players, you included.` : "Players including you."}
          >
            <input id="maxPlayers" name="maxPlayers" type="number" inputMode="numeric" required min={mode?.min_team_size ?? 1} max={mode?.max_team_size ?? 99} value={maxPlayers} onChange={(e) => setMaxPlayers(e.target.value)} className={controlClasses} {...ariaFor("maxPlayers", { hint: "x", error: fe.maxPlayers })} />
          </Field>
        </div>
      </fieldset>

      {/* 2. Roles */}
      <fieldset id="step-roles" className="flex min-w-0 flex-col gap-4 scroll-mt-24">
        <legend className="sr-only">Step 2: Roles needed</legend>
        <StepTitle n={2}>Roles needed</StepTitle>
        {roles.length === 0 ? (
          <p className="text-base text-wood-dark">Pick a game to see its roles.</p>
        ) : (
          <Group id="roles" legend="How many of each role are you looking for?" error={fe.roles} hint="Leave at 0 for open seats that take any role.">
            <ul role="list" className="grid gap-2 sm:grid-cols-2">
              {roles.map((r) => {
                const key = `need_${r.game_role_id}`;
                const id = `need-${r.game_role_id}`;
                return (
                  <li key={r.game_role_id} className="flex items-center gap-3 rounded-chip bg-parchment-dark/60 px-3 py-1.5 ring-1 ring-wood/40">
                    <Sprite name={roleSpriteName(r.name)} scale={2} />
                    <label htmlFor={id} className="flex-1 text-base font-semibold text-ink">{r.name}</label>
                    <input id={id} name={key} type="number" inputMode="numeric" min={0} max={20} value={needs[key] ?? ""} placeholder="0" onChange={(e) => setNeeds((n) => ({ ...n, [key]: e.target.value }))} className={`${controlClasses} !w-20 text-center`} aria-invalid={fe.roles ? true : undefined} />
                  </li>
                );
              })}
            </ul>
            <p aria-live="polite" className="mt-2 text-[15px] font-semibold text-ink">
              {seats > 0 ? `You plus ${needed} needed fills ${needed + 1} of ${seats} seats.` : ""}
            </p>
          </Group>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="hostRole" label="Your role" optional error={fe.hostRole}>
            <select id="hostRole" name="hostRole" defaultValue={str("hostRole")} disabled={!game} className={controlClasses} {...ariaFor("hostRole", { error: fe.hostRole })}>
              <option value="">No preference</option>
              {roles.map((r) => (
                <option key={r.game_role_id} value={r.game_role_id}>{r.name}</option>
              ))}
            </select>
          </Field>
          {accounts ? (
            <Field id="hostAccount" label={`Your account${platforms.find((p) => String(p.platform_id) === platformId) ? ` (${platforms.find((p) => String(p.platform_id) === platformId)?.identity_label})` : ""}`} optional error={fe.hostAccount} hint="Only accepted party members ever see it.">
              <select id="hostAccount" name="hostAccount" defaultValue={str("hostAccount")} disabled={!platformId} className={controlClasses} {...ariaFor("hostAccount", { hint: "x", error: fe.hostAccount })}>
                <option value="">{platformId ? (myAccounts.length ? "Decide later" : "No account on this platform") : "Pick a platform first"}</option>
                {myAccounts.map((a) => (
                  <option key={a.account_id} value={a.account_id}>{a.label}</option>
                ))}
              </select>
            </Field>
          ) : null}
        </div>
      </fieldset>

      {/* 3. Rules */}
      <fieldset id="step-rules" className="flex min-w-0 flex-col gap-4 scroll-mt-24">
        <legend className="sr-only">Step 3: Rules of the camp</legend>
        <StepTitle n={3}>Rules of the camp</StepTitle>
        <Group id="languages" legend="Languages spoken" error={fe.languages} hint="At least one.">
          <div className="grid gap-2 sm:grid-cols-3">
            {catalog.languages.map((l) => (
              <CheckRow key={l.language_code} name="languages" value={l.language_code} label={languageName(l.language_code) || l.name} defaultChecked={defaultLangs.includes(l.language_code)} />
            ))}
          </div>
        </Group>
        {catalog.tags.length > 0 ? (
          <Group id="tags" legend="Vibe tags" error={fe.tags}>
            <div className="grid gap-2 sm:grid-cols-3">
              {catalog.tags.map((t) => (
                <CheckRow key={t.tag_id} name="tags" value={String(t.tag_id)} label={t.name} defaultChecked={list("tags").includes(String(t.tag_id))} />
              ))}
            </div>
          </Group>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="region" label="Region" optional error={fe.region}>
            <select id="region" name="region" defaultValue={str("region")} className={controlClasses} {...ariaFor("region", { error: fe.region })}>
              <option value="">Anywhere</option>
              {catalog.regions.map((r) => (
                <option key={r.region_id} value={r.region_id}>{r.name}</option>
              ))}
            </select>
          </Field>
          <div className="flex flex-col justify-end gap-2">
            <CheckRow name="regionLocked" value="on" label="Lock to this region" defaultChecked={str("regionLocked") === "on"} />
            <CheckRow name="voiceRequired" value="on" label="Voice chat required" defaultChecked={str("voiceRequired") === "on"} />
          </div>
        </div>
        <Group id="visibility" legend="Who can see this quest" error={fe.visibility}>
          <div className="flex flex-wrap gap-2">
            {[
              ["public", "Everyone"],
              ["friends", "Friends only"],
              ["invite", "Invite only"],
            ].map(([v, label]) => (
              <label key={v} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-chip bg-parchment-dark/60 px-3 text-base text-ink ring-1 ring-wood/40 has-[:checked]:bg-ink has-[:checked]:text-cream">
                <input type="radio" name="visibility" value={v} defaultChecked={str("visibility", "public") === v} className="size-5 accent-[#5e3b27]" />
                {label}
              </label>
            ))}
          </div>
        </Group>
        <Group id="joinPolicy" legend="How people join" error={fe.joinPolicy}>
          <div className="flex flex-wrap gap-2">
            {[
              ["approval", "I approve each request"],
              ["auto", "Anyone may take a seat"],
            ].map(([v, label]) => (
              <label key={v} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-chip bg-parchment-dark/60 px-3 text-base text-ink ring-1 ring-wood/40 has-[:checked]:bg-ink has-[:checked]:text-cream">
                <input type="radio" name="joinPolicy" value={v} defaultChecked={str("joinPolicy", "approval") === v} className="size-5 accent-[#5e3b27]" />
                {label}
              </label>
            ))}
          </div>
        </Group>
        <Group id="rankRange" legend="Rank range" error={fe.rankRange} hint={ranks.length ? "Lowest to highest rank welcome. Leave empty for any." : "Pick a game to see its ranks."}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="minRank" className="mb-1 block text-[15px] font-semibold text-ink">Lowest rank</label>
              <select id="minRank" name="minRank" defaultValue={str("minRank")} disabled={ranks.length === 0} className={controlClasses} aria-invalid={fe.rankRange ? true : undefined} aria-describedby={fe.rankRange ? "rankRange-error" : undefined}>
                <option value="">Any</option>
                {ranks.map((r) => (
                  <option key={r.rank_id} value={r.rank_id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="maxRank" className="mb-1 block text-[15px] font-semibold text-ink">Highest rank</label>
              <select id="maxRank" name="maxRank" defaultValue={str("maxRank")} disabled={ranks.length === 0} className={controlClasses} aria-invalid={fe.rankRange ? true : undefined} aria-describedby={fe.rankRange ? "rankRange-error" : undefined}>
                <option value="">Any</option>
                {ranks.map((r) => (
                  <option key={r.rank_id} value={r.rank_id}>{r.name}</option>
                ))}
              </select>
            </div>
          </div>
        </Group>
        <Field id="minRating" label="Minimum teammate rating" optional error={fe.minRating} hint="1 to 5 stars. Newcomers without reviews are not turned away.">
          <input id="minRating" name="minRating" type="number" inputMode="decimal" min={1} max={5} step={0.1} defaultValue={str("minRating")} className={`${controlClasses} sm:max-w-40`} {...ariaFor("minRating", { hint: "x", error: fe.minRating })} />
        </Field>
      </fieldset>

      {/* 4. Schedule */}
      <fieldset id="step-when" className="flex min-w-0 flex-col gap-4 scroll-mt-24">
        <legend className="sr-only">Step 4: Schedule</legend>
        <StepTitle n={4}>When do you set out?</StepTitle>
        <Field id="scheduledStart" label="Start time" optional error={fe.scheduledStart} hint="In your own time zone. Leave empty to play as soon as the party is ready.">
          <input id="scheduledStart" name="scheduledStart" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={`${controlClasses} sm:max-w-72`} {...ariaFor("scheduledStart", { hint: "x", error: fe.scheduledStart })} />
        </Field>
        <input type="hidden" name="tzOffset" value={tzOffset} />
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="green" disabled={pending} aria-disabled={pending}>
          <Sprite name="icon-new-quest" />
          {pending ? "Pinning your quest..." : "Post the quest"}
        </Button>
        <span className="text-[15px] text-wood-dark">The board updates the moment it is posted.</span>
      </div>
    </form>
  );
}
