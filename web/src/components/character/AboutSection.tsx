"use client";

import { useState } from "react";
import { saveAbout } from "@/app/(hearth)/character/edit/actions";
import { Field, Group, ariaFor, controlClasses } from "@/components/quest/Field";
import { LIMITS, REGION_STRICTNESS, type Option, type ProfileEditData, type RegionStrictness } from "@/lib/profile/types";
import { ChoiceRow } from "./ChoiceRow";
import { COMMON_TIMEZONES } from "./platform";
import { SectionForm, type SectionCtx } from "./SectionForm";

const STRICTNESS: Record<RegionStrictness, { label: string; text: string }> = {
  strict: { label: "Strict", text: "Only parties from my home region." },
  nearby: { label: "Nearby", text: "My home region and the ones next door." },
  any: { label: "Anywhere", text: "Region does not matter to me." },
};

function AboutFields({
  ctx,
  about,
  countries,
  regions,
}: {
  ctx: SectionCtx;
  about: ProfileEditData["about"];
  countries: Option<string>[];
  regions: Option[];
}) {
  const { fe, str } = ctx;
  const bioDefault = str("bio", about.bio);
  const [bioLen, setBioLen] = useState(bioDefault.length);
  const tz = str("timezone", about.timezone);
  const zones = COMMON_TIMEZONES.includes(tz) || tz === "" ? COMMON_TIMEZONES : [tz, ...COMMON_TIMEZONES];
  const strictness = str("regionStrictness", about.regionStrictness);

  return (
    <>
      <Field id="about-displayName" label="Display name" error={fe.displayName} hint="This is the name other players see.">
        <input
          id="about-displayName"
          name="displayName"
          aria-required="true"
          maxLength={LIMITS.displayName}
          autoComplete="nickname"
          defaultValue={str("displayName", about.displayName)}
          className={controlClasses}
          {...ariaFor("about-displayName", { hint: "x", error: fe.displayName })}
        />
      </Field>
      <Field
        id="about-bio"
        label="Bio"
        optional
        error={fe.bio}
        hint={`A line or two about how you play. ${bioLen} of ${LIMITS.bio} characters used.`}
      >
        <textarea
          id="about-bio"
          name="bio"
          rows={4}
          maxLength={LIMITS.bio}
          defaultValue={bioDefault}
          onInput={(e) => setBioLen(e.currentTarget.value.length)}
          className={controlClasses}
          {...ariaFor("about-bio", { hint: "x", error: fe.bio })}
        />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="about-timezone" label="Timezone" error={fe.timezone} hint="Your availability is read in this timezone.">
          <select id="about-timezone" name="timezone" defaultValue={tz} className={controlClasses} {...ariaFor("about-timezone", { hint: "x", error: fe.timezone })}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field id="about-countryCode" label="Country" optional error={fe.countryCode}>
          <select
            id="about-countryCode"
            name="countryCode"
            defaultValue={str("countryCode", about.countryCode ?? "")}
            className={controlClasses}
            {...ariaFor("about-countryCode", { error: fe.countryCode })}
          >
            <option value="">None</option>
            {countries.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="about-homeRegionId" label="Home region" optional error={fe.homeRegionId}>
          <select
            id="about-homeRegionId"
            name="homeRegionId"
            defaultValue={str("homeRegionId", about.homeRegionId === null ? "" : String(about.homeRegionId))}
            className={controlClasses}
            {...ariaFor("about-homeRegionId", { error: fe.homeRegionId })}
          >
            <option value="">None</option>
            {regions.map((r) => (
              <option key={r.value} value={String(r.value)}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Group id="about-regionStrictness" legend="How strict should matching be about region?" error={fe.regionStrictness}>
        <div className="mt-1 grid gap-2 sm:grid-cols-3">
          {REGION_STRICTNESS.map((r) => (
            <ChoiceRow
              key={r}
              type="radio"
              name="regionStrictness"
              value={r}
              label={STRICTNESS[r].label}
              description={STRICTNESS[r].text}
              defaultChecked={strictness === r}
            />
          ))}
        </div>
      </Group>
    </>
  );
}

export function AboutSection({
  data,
}: {
  data: Pick<ProfileEditData, "about" | "countries" | "regions">;
}) {
  return (
    <SectionForm
      action={saveAbout}
      prefix="about"
      dataKey={JSON.stringify(data.about)}
      submitLabel="Save about you"
      pendingLabel="Saving your details"
    >
      {(ctx) => <AboutFields ctx={ctx} about={data.about} countries={data.countries} regions={data.regions} />}
    </SectionForm>
  );
}
