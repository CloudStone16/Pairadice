import { Chip, type ChipTone } from "@/components/ui";
import type { SessionStatus } from "@/lib/types";

const STATUS: Record<SessionStatus, { label: string; tone: ChipTone }> = {
  open: { label: "Open", tone: "green" },
  full: { label: "Full", tone: "yellow" },
  in_progress: { label: "In progress", tone: "blue" },
  completed: { label: "Completed", tone: "lavender" },
  cancelled: { label: "Cancelled", tone: "red" },
};

export function StatusChip({ status }: { status: SessionStatus }) {
  const s = STATUS[status] ?? { label: status, tone: "lavender" as const };
  return <Chip tone={s.tone}>{s.label}</Chip>;
}
