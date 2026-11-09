"use client";

import { useState } from "react";
import { removeGameProfile, saveGameProfile } from "@/app/(hearth)/character/edit/actions";
import { Field, Group, controlClasses, ariaFor } from "@/components/quest/Field";
import { Sprite } from "@/components/ui";
import { cartSprite } from "@/lib/format";
import {
  LIMITS,
  type EditableAccount,
  type EditableGame,
  type EditableGameProfile,
  type ProfileEditData,
} from "@/lib/profile/types";
import { ChoiceRow } from "./ChoiceRow";
import { ConfirmRemove } from "./ConfirmRemove";
import { RemoveScope } from "./RemoveScope";
import { rankMedal } from "./platform";
import { SectionForm, type SectionCtx } from "./SectionForm";

interface Initial {
  accountId: string;
  rankId: string;
  modes: string[];
  roles: [string, string, string];
}

function initialFor(ctx: SectionCtx, game: EditableGame, profile?: EditableGameProfile): Initial {
  // Echoed values only count when they belong to this game (the add form can switch games).
  if (ctx.refill && ctx.str("gameId") === String(game.gameId)) {
    return {
      accountId: ctx.str("platformAccountId"),
      rankId: ctx.str("rankId"),
      modes: ctx.list("modes"),
      roles: [ctx.str("role1"), ctx.str("role2"), ctx.str("role3")],
    };
  }
  const r = profile?.roleIds ?? [];
  return {
    accountId: profile?.platformAccountId == null ? "" : String(profile.platformAccountId),
    rankId: profile?.rankId == null ? "" : String(profile.rankId),
    modes: (profile?.modeIds ?? []).map(String),
    roles: [r[0] == null ? "" : String(r[0]), r[1] == null ? "" : String(r[1]), r[2] == null ? "" : String(r[2])],
  };
}

const ROLE_LABELS = ["First choice", "Second choice", "Third choice"] as const;

/** Everything that depends on the chosen game. Remounted (by key) when the game changes. */
function GameDetails({
  ctx,
  prefix,
  game,
  accounts,
  platformNames,
  initial,
}: {
  ctx: SectionCtx;
  prefix: string;
  game: EditableGame;
  accounts: EditableAccount[];
  platformNames: string[];
  initial: Initial;
}) {
  const { fe } = ctx;
  const [pickedAccount, setPickedAccount] = useState(initial.accountId);
  const [rankId, setRankId] = useState(initial.rankId);
  const [modes, setModes] = useState(initial.modes);
  const [roles, setRoles] = useState<string[]>(initial.roles);

  const usable = accounts.filter((a) => game.platformIds.includes(a.platformId));
  const accountValue = usable.some((a) => String(a.accountId) === pickedAccount) ? pickedAccount : "";
  const rankIndex = game.ranks.findIndex((r) => String(r.value) === rankId);
  const modesFull = modes.length >= LIMITS.modes;
  const accHint = usable.length === 0
    ? `You have no account on ${platformNames.join(" or ") || "this game's platforms"} yet. Add one in Platform accounts above to link it.`
    : undefined;

  return (
    <>
      <Field id={`${prefix}-platformAccountId`} label="Platform account" optional error={fe.platformAccountId} hint={accHint}>
        <select
          id={`${prefix}-platformAccountId`}
          name="platformAccountId"
          value={accountValue}
          onChange={(e) => setPickedAccount(e.target.value)}
          className={controlClasses}
          {...ariaFor(`${prefix}-platformAccountId`, { hint: accHint, error: fe.platformAccountId })}
        >
          <option value="">None</option>
          {usable.map((a) => (
            <option key={a.accountId} value={String(a.accountId)}>
              {a.platformName}: {a.handle}
              {a.discriminator ? `#${a.discriminator}` : ""}
            </option>
          ))}
        </select>
      </Field>

      <Field id={`${prefix}-rankId`} label="Rank" optional error={fe.rankId}>
        <div className="flex items-center gap-3">
          <select
            id={`${prefix}-rankId`}
            name="rankId"
            value={rankId}
            onChange={(e) => setRankId(e.target.value)}
            className={controlClasses}
            {...ariaFor(`${prefix}-rankId`, { error: fe.rankId })}
          >
            <option value="">Unranked</option>
            {game.ranks.map((r) => (
              <option key={r.value} value={String(r.value)}>
                {r.label}
              </option>
            ))}
          </select>
          {rankIndex >= 0 ? <Sprite name={rankMedal(rankIndex, game.ranks.length)} scale={2} /> : null}
        </div>
      </Field>

      {game.modes.length > 0 ? (
        <Group
          id={`${prefix}-modes`}
          legend="Modes you play"
          error={fe.modes}
          hint={`Up to ${LIMITS.modes}. ${modes.length} of ${LIMITS.modes} chosen.${modesFull ? " Untick one to choose another." : ""}`}
        >
          <div className="mt-1 flex flex-wrap gap-2">
            {game.modes.map((m) => {
              const id = String(m.value);
              const on = modes.includes(id);
              return (
                <ChoiceRow
                  key={id}
                  type="checkbox"
                  name="modes"
                  value={id}
                  label={m.label}
                  pill
                  checked={on}
                  disabled={!on && modesFull}
                  onChange={(c) => setModes((cur) => (c ? [...cur, id] : cur.filter((x) => x !== id)))}
                />
              );
            })}
          </div>
        </Group>
      ) : null}

      {game.roles.length > 0 ? (
        <Group id={`${prefix}-roles`} legend="Roles you like, in order" error={fe.roles} hint="Each role can only be picked once.">
          <div className="mt-1 grid gap-3 sm:grid-cols-3">
            {ROLE_LABELS.map((label, i) => {
              const key = `role${i + 1}`;
              const id = `${prefix}-${key}`;
              return (
                <Field key={key} id={id} label={label} error={fe[key]}>
                  <select
                    id={id}
                    name={key}
                    value={roles[i] ?? ""}
                    onChange={(e) => setRoles((cur) => cur.map((v, j) => (j === i ? e.target.value : v)))}
                    className={controlClasses}
                    {...ariaFor(id, { error: fe[key] })}
                  >
                    <option value="">None</option>
                    {game.roles.map((r) => {
                      const v = String(r.value);
                      const taken = roles.some((x, j) => j !== i && x === v);
                      return (
                        <option key={v} value={v} disabled={taken}>
                          {r.label}
                          {taken ? " (already picked)" : ""}
                        </option>
                      );
                    })}
                  </select>
                </Field>
              );
            })}
          </div>
        </Group>
      ) : null}
    </>
  );
}

function ProfileCard({
  profile,
  game,
  accounts,
  platformNames,
}: {
  profile: EditableGameProfile;
  game: EditableGame;
  accounts: EditableAccount[];
  platformNames: string[];
}) {
  const prefix = `gp-${profile.profileId}`;
  return (
    <li className="flex flex-col gap-4 rounded-frame bg-parchment-dark/40 p-4 ring-1 ring-wood/40">
      <h3 className="flex items-center gap-2 font-display text-lg font-bold [overflow-wrap:anywhere]">
        <Sprite name={cartSprite(game.slug)} />
        {game.name}
      </h3>
      <SectionForm
        action={saveGameProfile}
        prefix={prefix}
        dataKey={JSON.stringify(profile)}
        submitLabel={`Save ${game.name}`}
        headingLevel={4}
        pendingLabel={`Saving ${game.name}`}
        hidden={<input type="hidden" name="gameId" value={game.gameId} />}
      >
        {(ctx) => (
          <GameDetails
            ctx={ctx}
            prefix={prefix}
            game={game}
            accounts={accounts}
            platformNames={platformNames}
            initial={initialFor(ctx, game, profile)}
          />
        )}
      </SectionForm>
      <ConfirmRemove
        action={removeGameProfile}
        fieldName="profileId"
        value={profile.profileId}
        label="Remove game"
        ariaLabel={`Remove game ${game.name}`}
        sectionId="games"
        what={`${game.name} from your character`}
      />
    </li>
  );
}

function AddGameFields({
  ctx,
  available,
  accounts,
  platformNamesFor,
}: {
  ctx: SectionCtx;
  available: EditableGame[];
  accounts: EditableAccount[];
  platformNamesFor: (g: EditableGame) => string[];
}) {
  const [gameId, setGameId] = useState(() => ctx.str("gameId"));
  const game = available.find((g) => String(g.gameId) === gameId);
  return (
    <>
      <Field id="gp-new-gameId" label="Game" error={ctx.fe.gameId}>
        <select
          id="gp-new-gameId"
          name="gameId"
          aria-required="true"
          value={gameId}
          onChange={(e) => setGameId(e.target.value)}
          className={controlClasses}
          {...ariaFor("gp-new-gameId", { error: ctx.fe.gameId })}
        >
          <option value="">Choose a game</option>
          {available.map((g) => (
            <option key={g.gameId} value={String(g.gameId)}>
              {g.name}
            </option>
          ))}
        </select>
      </Field>
      {game ? (
        <GameDetails
          key={game.gameId}
          ctx={ctx}
          prefix="gp-new"
          game={game}
          accounts={accounts}
          platformNames={platformNamesFor(game)}
          initial={initialFor(ctx, game)}
        />
      ) : null}
    </>
  );
}

export function GamesSection({
  data,
}: {
  data: Pick<ProfileEditData, "games" | "gameProfiles" | "accounts" | "platforms">;
}) {
  const { games, gameProfiles, accounts, platforms } = data;
  const platformNamesFor = (g: EditableGame) =>
    g.platformIds.map((id) => platforms.find((p) => p.value === id)?.label).filter((n): n is string => Boolean(n));
  const owned = new Set(gameProfiles.map((p) => p.gameId));
  const available = games.filter((g) => !owned.has(g.gameId));

  return (
    <RemoveScope>
    <div className="flex flex-col gap-6">
      {gameProfiles.length === 0 ? (
        <p className="rounded-frame bg-parchment-dark/50 p-4 text-base">
          Your shelf is empty. Add the first game you play below and parties will start finding you.
        </p>
      ) : (
        <ul role="list" className="flex flex-col gap-5">
          {gameProfiles.map((p) => {
            const game = games.find((g) => g.gameId === p.gameId);
            if (!game) return null;
            return <ProfileCard key={p.profileId} profile={p} game={game} accounts={accounts} platformNames={platformNamesFor(game)} />;
          })}
        </ul>
      )}
      <div className="rounded-frame border-2 border-dashed border-wood/60 p-4">
        <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
          <Sprite name="icon-plus" />
          Add a game
        </h3>
        {available.length === 0 ? (
          <p className="text-base">Every game we know is already on your shelf.</p>
        ) : (
          <SectionForm
            action={saveGameProfile}
            prefix="gp-new"
            dataKey={`${gameProfiles.length}`}
            submitLabel="Add game"
            submitIcon="icon-plus"
            submitVariant="yellow"
            pendingLabel="Adding the game"
            headingLevel={4}
          >
            {(ctx) => <AddGameFields ctx={ctx} available={available} accounts={accounts} platformNamesFor={platformNamesFor} />}
          </SectionForm>
        )}
      </div>
    </div>
    </RemoveScope>
  );
}
