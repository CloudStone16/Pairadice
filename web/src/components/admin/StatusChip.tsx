import { Chip } from "@/components/ui";
import type { RoleName, UserChip } from "@/lib/moderation/types";

const TONE = { active: "green", suspended: "yellow", banned: "red" } as const;

export function StatusChip({ status }: { status: UserChip["status"] }) {
  return (
    <Chip tone={TONE[status]}>
      <span className="sr-only">Account status: </span>
      {status}
    </Chip>
  );
}

const ROLE_TONE = { player: "lavender", moderator: "blue", admin: "ember" } as const;

export function RoleChips({ roles }: { roles: RoleName[] }) {
  if (roles.length === 0) return <span className="text-[15px] text-lavender">no roles</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {roles.map((r) => (
        <Chip key={r} tone={ROLE_TONE[r]}>
          {r}
        </Chip>
      ))}
    </span>
  );
}
