"use client";

import { removeAccount, saveAccount } from "@/app/(hearth)/character/edit/actions";
import { Chip, Sprite } from "@/components/ui";
import { Field, controlClasses, ariaFor } from "@/components/quest/Field";
import { LIMITS, type EditableAccount, type Option, type ProfileEditData } from "@/lib/profile/types";
import { ChoiceRow } from "./ChoiceRow";
import { ConfirmRemove } from "./ConfirmRemove";
import { RemoveScope } from "./RemoveScope";
import { platformSprite } from "./platform";
import { SectionForm, type SectionCtx } from "./SectionForm";

function AccountFields({
  ctx,
  prefix,
  account,
  platforms,
}: {
  ctx: SectionCtx;
  prefix: string;
  account?: EditableAccount;
  platforms: Option[];
}) {
  const { fe, str } = ctx;
  const locked = account?.inUse === true;
  const platformValue = str("platformId", account ? String(account.platformId) : "");
  const isPublic = ctx.refill ? str("isPublic") === "on" : (account?.isPublic ?? false);
  const pid = `${prefix}-platformId`;
  return (
    <>
      <Field
        id={pid}
        label="Platform"
        error={fe.platformId}
        hint={locked ? "A game profile uses this account, so its platform is locked. Remove that game profile first to change it." : undefined}
      >
        <select
          id={pid}
          name={locked ? undefined : "platformId"}
          aria-required="true"
          aria-disabled={locked ? true : undefined}
          defaultValue={platformValue}
          className={`${controlClasses} aria-disabled:opacity-70`}
          {...ariaFor(pid, { hint: locked ? "x" : undefined, error: fe.platformId })}
        >
          {account ? null : <option value="">Choose a platform</option>}
          {(locked ? platforms.filter((p) => String(p.value) === platformValue) : platforms).map((p) => (
            <option key={p.value} value={String(p.value)}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>
      {locked ? <input type="hidden" name="platformId" value={platformValue} /> : null}
      <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Field id={`${prefix}-handle`} label="Gamertag or handle" error={fe.handle}>
          <input
            id={`${prefix}-handle`}
            name="handle"
            aria-required="true"
            maxLength={LIMITS.handle}
            autoComplete="off"
            defaultValue={str("handle", account?.handle ?? "")}
            className={controlClasses}
            {...ariaFor(`${prefix}-handle`, { error: fe.handle })}
          />
        </Field>
        <Field id={`${prefix}-discriminator`} label="Tag number" optional error={fe.discriminator} hint="The #1234 part, if your platform has one.">
          <input
            id={`${prefix}-discriminator`}
            name="discriminator"
            maxLength={LIMITS.discriminator}
            autoComplete="off"
            defaultValue={str("discriminator", account?.discriminator ?? "")}
            className={controlClasses}
            {...ariaFor(`${prefix}-discriminator`, { hint: "x", error: fe.discriminator })}
          />
        </Field>
      </div>
      <div>
        <ChoiceRow
          type="checkbox"
          name="isPublic"
          value="on"
          label="Show publicly"
          description="Gamertags are only shown to your party once you're accepted. Tick this to show it on your profile too."
          defaultChecked={isPublic}
        />
      </div>
    </>
  );
}

function AccountForm({ account, platforms }: { account?: EditableAccount; platforms: Option[] }) {
  const prefix = account ? `acc-${account.accountId}` : "acc-new";
  return (
    <SectionForm
      action={saveAccount}
      prefix={prefix}
      dataKey={JSON.stringify(account ?? null)}
      submitLabel={account ? "Save account" : "Add account"}
      submitAriaLabel={account ? `Save account ${account.platformName}: ${account.handle}` : undefined}
      headingLevel={4}
      submitIcon={account ? "icon-save" : "icon-plus"}
      submitVariant={account ? "green" : "yellow"}
      pendingLabel={account ? "Saving this account" : "Adding your account"}
      hidden={<input type="hidden" name="accountId" value={account ? account.accountId : ""} />}
    >
      {(ctx) => <AccountFields ctx={ctx} prefix={prefix} account={account} platforms={platforms} />}
    </SectionForm>
  );
}

export function AccountsSection({ data }: { data: Pick<ProfileEditData, "accounts" | "platforms"> }) {
  const { accounts, platforms } = data;
  const full = accounts.length >= LIMITS.accounts;
  return (
    <RemoveScope>
    <div className="flex flex-col gap-6">
      {accounts.length === 0 ? (
        <p className="rounded-frame bg-parchment-dark/50 p-4 text-base">
          No gamertags yet. Add one below so your party knows who to look for once you are accepted.
        </p>
      ) : (
        <ul role="list" className="flex flex-col gap-5">
          {accounts.map((a) => (
            <li key={a.accountId} className="flex flex-col gap-4 rounded-frame bg-parchment-dark/40 p-4 ring-1 ring-wood/40">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="flex min-w-0 items-center gap-2 font-display text-lg font-bold [overflow-wrap:anywhere]">
                  <Sprite name={platformSprite(a.platformName)} scale={2} />
                  <span>
                    {a.platformName}: {a.handle}
                    {a.discriminator ? `#${a.discriminator}` : ""}
                  </span>
                </h3>
                <Chip tone={a.isPublic ? "green" : "parchment"} icon={<Sprite name={a.isPublic ? "icon-eye" : "icon-eye-off"} />}>
                  {a.isPublic ? "Shown publicly" : "Party only"}
                </Chip>
                {a.inUse ? <Chip tone="blue">Used by a game profile</Chip> : null}
              </div>
              <AccountForm account={a} platforms={platforms} />
              <ConfirmRemove
                action={removeAccount}
                fieldName="accountId"
                value={a.accountId}
                label="Remove account"
                ariaLabel={`Remove account ${a.platformName}: ${a.handle}`}
                sectionId="accounts"
                what={`${a.platformName} account ${a.handle}`}
              />
            </li>
          ))}
        </ul>
      )}
      <div className="rounded-frame border-2 border-dashed border-wood/60 p-4">
        <h3 className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
          <Sprite name="icon-plus" />
          Add an account
        </h3>
        {full ? (
          <p className="text-base">
            You have reached the limit of {LIMITS.accounts} accounts. Remove one to add another.
          </p>
        ) : (
          <AccountForm platforms={platforms} />
        )}
      </div>
    </div>
    </RemoveScope>
  );
}
