"use client";

import { useState } from "react";
import { saveTags } from "@/app/(hearth)/character/edit/actions";
import { Group } from "@/components/quest/Field";
import { LIMITS, type ProfileEditData } from "@/lib/profile/types";
import { ChoiceRow } from "./ChoiceRow";
import { SectionForm, type SectionCtx } from "./SectionForm";

function TagFields({ ctx, tags }: { ctx: SectionCtx; tags: ProfileEditData["tags"] }) {
  const [selected, setSelected] = useState<string[]>(() => ctx.list("tags", tags.selected.map(String)));
  const atMax = selected.length >= LIMITS.tags;
  return (
    <Group
      id="tags-tags"
      legend="What is your vibe?"
      error={ctx.fe.tags}
      hint={`Pick up to ${LIMITS.tags}. ${selected.length} of ${LIMITS.tags} chosen.${atMax ? " That is the limit, so the other tags are unavailable. Untick one to choose another." : ""}`}
    >
      <div className="mt-1 flex flex-wrap gap-2">
        {tags.all.map((t) => {
          const id = String(t.value);
          const on = selected.includes(id);
          return (
            <ChoiceRow
              key={id}
              type="checkbox"
              name="tags"
              value={id}
              label={t.label}
              pill
              checked={on}
              disabled={!on && atMax}
              onChange={(c) => setSelected((cur) => (c ? [...cur, id] : cur.filter((x) => x !== id)))}
            />
          );
        })}
      </div>
      <p role="status" className="mt-2 text-[15px] font-semibold text-ink">
        {atMax ? `That is the ${LIMITS.tags} tag limit. Untick one to choose another.` : ""}
      </p>
    </Group>
  );
}

export function TagsSection({ data }: { data: Pick<ProfileEditData, "tags"> }) {
  return (
    <SectionForm
      action={saveTags}
      prefix="tags"
      dataKey={JSON.stringify(data.tags.selected)}
      submitLabel="Save vibe tags"
      pendingLabel="Saving your vibe tags"
    >
      {(ctx) => <TagFields ctx={ctx} tags={data.tags} />}
    </SectionForm>
  );
}
