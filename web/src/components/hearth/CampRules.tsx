import type { ReactNode } from "react";
import { Chip, Sprite, Window } from "@/components/ui";
import { languageName } from "@/lib/format";
import type { Camp, SlotNeed } from "@/lib/types";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-lavender/15 py-2 last:border-0">
      <dt className="text-sm text-lavender">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-semibold [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

const VISIBILITY: Record<string, string> = {
  public: "Public",
  friends: "Friends only",
  invite: "Invite only",
};

export function LookingFor({ needs }: { needs: SlotNeed[] }) {
  return (
    <Window title="Looking for">
      {needs.length === 0 ? (
        <p className="text-sm text-lavender">Any role is welcome.</p>
      ) : (
        <ul role="list" className="flex flex-wrap gap-2">
          {needs.map((n, i) => (
            <li key={`${n.role}-${i}`}>
              <Chip tone="yellow" icon={<Sprite name="icon-controller" />}>
                {n.slots_needed}&times; {n.role}
              </Chip>
            </li>
          ))}
        </ul>
      )}
    </Window>
  );
}

export function CampRules({
  camp,
  languages,
  tags,
}: {
  camp: Camp;
  languages: string[];
  tags: string[];
}) {
  const ranks =
    camp.min_rank || camp.max_rank
      ? `${camp.min_rank ?? "Any"} to ${camp.max_rank ?? "Any"}`
      : "Any rank";
  return (
    <Window title="House rules">
      <dl>
        <Row label="Region">
          {camp.region_name ? `${camp.region_name} (${camp.region_code})` : "Anywhere"}
          {camp.region_locked ? " · locked" : ""}
        </Row>
        <Row label="Voice chat">{camp.voice_required ? "Required" : "Optional"}</Row>
        <Row label="Visibility">{VISIBILITY[camp.visibility] ?? camp.visibility}</Row>
        <Row label="Joining">{camp.join_policy === "auto" ? "Instant join" : "Host approval"}</Row>
        <Row label="Min rating">
          {camp.min_avg_rating === null ? "None" : `${camp.min_avg_rating.toFixed(1)} stars`}
        </Row>
        <Row label="Rank range">{ranks}</Row>
        <Row label="Languages">
          {languages.length > 0 ? languages.map(languageName).join(", ") : "Any"}
        </Row>
      </dl>
      {tags.length > 0 ? (
        <ul role="list" className="mt-3 flex flex-wrap gap-2" aria-label="Tags">
          {tags.map((t) => (
            <li key={t}>
              <Chip tone="lavender">#{t}</Chip>
            </li>
          ))}
        </ul>
      ) : null}
    </Window>
  );
}
