import { Chip, Sprite, type ChipTone } from "@/components/ui";
import type { ReportStatus, SanctionType, UserChip } from "@/lib/moderation/types";
import type { SpriteName } from "@/lib/sprite-names";

// Every badge says its state in words and carries a distinct shape, so colour is never the only cue.

const REPORT: Record<ReportStatus, { label: string; shape: string; tone: ChipTone }> = {
  open: { label: "Open", shape: "○", tone: "yellow" },
  reviewing: { label: "Reviewing", shape: "◐", tone: "blue" },
  actioned: { label: "Actioned", shape: "■", tone: "green" },
  dismissed: { label: "Dismissed", shape: "✕", tone: "parchment" },
};

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  const s = REPORT[status];
  return (
    <Chip tone={s.tone} icon={<span aria-hidden="true">{s.shape}</span>}>
      {s.label}
    </Chip>
  );
}

const SANCTION: Record<SanctionType, { label: string; icon: SpriteName; tone: ChipTone }> = {
  warn: { label: "Warn", icon: "icon-warning", tone: "yellow" },
  mute: { label: "Mute", icon: "icon-mute", tone: "blue" },
  suspend: { label: "Suspend", icon: "icon-hourglass", tone: "ember" },
  ban: { label: "Ban", icon: "icon-ban", tone: "red" },
};

export function SanctionTypeBadge({ type }: { type: SanctionType }) {
  const s = SANCTION[type];
  return (
    <Chip tone={s.tone} icon={<Sprite name={s.icon} />}>
      {s.label}
    </Chip>
  );
}

export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Chip tone={active ? "green" : "parchment"} icon={<span aria-hidden="true">{active ? "●" : "◌"}</span>}>
      {active ? "Active" : "Ended"}
    </Chip>
  );
}

const ACCOUNT: Record<UserChip["status"], { label: string; shape: string; tone: ChipTone }> = {
  active: { label: "Active account", shape: "●", tone: "green" },
  suspended: { label: "Suspended", shape: "◐", tone: "ember" },
  banned: { label: "Banned", shape: "✕", tone: "red" },
};

export function AccountStatusBadge({ status }: { status: UserChip["status"] }) {
  const s = ACCOUNT[status];
  return (
    <Chip tone={s.tone} icon={<span aria-hidden="true">{s.shape}</span>}>
      {s.label}
    </Chip>
  );
}
