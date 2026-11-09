import Link from "next/link";
import { Avatar } from "@/components/ui";
import type { AdminUserRow } from "@/lib/queries-admin";
import { RoleChips, StatusChip } from "./StatusChip";

/** One stacked card per user on phones; a four-column grid from sm up. Each row links to the detail page. */
export function UserList({ users }: { users: AdminUserRow[] }) {
  return (
    <ul role="list" className="flex flex-col gap-2">
      <li aria-hidden="true" className="hidden grid-cols-[minmax(0,2fr)_6rem_minmax(0,2fr)_7rem] gap-4 px-3 text-sm font-semibold uppercase tracking-wider text-lavender md:grid">
        <span>Player</span>
        <span>Status</span>
        <span>Roles</span>
        <span>Active sanctions</span>
      </li>
      {users.map((u) => (
        <li
          key={u.userId}
          className="grid items-center gap-x-4 gap-y-2 rounded-frame bg-ink/30 p-3 md:grid-cols-[minmax(0,2fr)_6rem_minmax(0,2fr)_7rem]"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Avatar userId={u.userId} size={32} />
            <Link
              href={`/admin/users/${u.userId}`}
              className="min-w-0 leading-tight underline-offset-2 hover:underline"
            >
              <span className="block font-display text-base font-semibold [overflow-wrap:anywhere]">{u.displayName}</span>
              <span className="block text-[15px] text-lavender [overflow-wrap:anywhere]">@{u.username}</span>
            </Link>
          </div>
          <div>
            <StatusChip status={u.status} />
          </div>
          <RoleChips roles={u.roles} />
          <p className="text-[15px]">
            <span className="text-lavender md:sr-only">Active sanctions: </span>
            <span className="font-semibold">{u.activeSanctions}</span>
          </p>
        </li>
      ))}
    </ul>
  );
}
