"use client";

import { useState } from "react";
import { saveLanguages } from "@/app/(hearth)/character/edit/actions";
import { Group } from "@/components/quest/Field";
import { LIMITS, type ProfileEditData } from "@/lib/profile/types";
import { ChoiceRow } from "./ChoiceRow";
import { SectionForm, type SectionCtx } from "./SectionForm";

function LanguageFields({ ctx, languages }: { ctx: SectionCtx; languages: ProfileEditData["languages"] }) {
  const [selected, setSelected] = useState<string[]>(() => ctx.list("languages", languages.selected));
  const [primary, setPrimary] = useState(() => ctx.str("primary", languages.primary ?? ""));
  const atMax = selected.length >= LIMITS.languages;
  const chosen = languages.all.filter((l) => selected.includes(l.value));
  const effectivePrimary = selected.includes(primary) ? primary : (chosen[0]?.value ?? "");

  function toggle(code: string, on: boolean) {
    setSelected((cur) => (on ? [...cur, code] : cur.filter((c) => c !== code)));
  }

  return (
    <>
      <Group
        id="languages-languages"
        legend="Languages you play in"
        error={ctx.fe.languages}
        hint={`Pick up to ${LIMITS.languages}. ${selected.length} of ${LIMITS.languages} chosen.${atMax ? " That is the limit, so the other languages are unavailable. Untick one to choose another." : ""}`}
      >
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          {languages.all.map((l) => {
            const on = selected.includes(l.value);
            return (
              <ChoiceRow
                key={l.value}
                type="checkbox"
                name="languages"
                value={l.value}
                label={l.label}
                checked={on}
                disabled={!on && atMax}
                onChange={(c) => toggle(l.value, c)}
              />
            );
          })}
        </div>
        <p role="status" className="mt-2 text-[15px] font-semibold text-ink">
          {atMax ? `That is the ${LIMITS.languages} language limit. Untick one to choose another.` : ""}
        </p>
      </Group>
      <Group id="languages-primary" legend="Main language" error={ctx.fe.primary}>
        {chosen.length === 0 ? (
          <p className="text-base text-wood-dark">Pick at least one language above, then choose your main one here.</p>
        ) : (
          <div className="mt-1 flex flex-wrap gap-2">
            {chosen.map((l) => (
              <ChoiceRow
                key={l.value}
                type="radio"
                name="primary"
                value={l.value}
                label={l.label}
                pill
                checked={effectivePrimary === l.value}
                onChange={() => setPrimary(l.value)}
              />
            ))}
          </div>
        )}
      </Group>
    </>
  );
}

export function LanguagesSection({ data }: { data: Pick<ProfileEditData, "languages"> }) {
  return (
    <SectionForm
      action={saveLanguages}
      prefix="languages"
      dataKey={JSON.stringify(data.languages.selected) + (data.languages.primary ?? "")}
      submitLabel="Save languages"
      pendingLabel="Saving your languages"
    >
      {(ctx) => <LanguageFields ctx={ctx} languages={data.languages} />}
    </SectionForm>
  );
}
