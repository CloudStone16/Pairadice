import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RoleControls } from "@/components/admin/RoleControls";
import { RoleChips, StatusChip } from "@/components/admin/StatusChip";
import { RecentReports, SanctionHistory } from "@/components/admin/UserHistory";
import { Avatar, Window } from "@/components/ui";
import { requireRole } from "@/lib/auth/guards";
import { getAdminUser } from "@/lib/queries-admin";
import { getUserById } from "@/lib/queries";
import { parseId } from "@/lib/report/validate";

export const metadata: Metadata = { title: "User | PairADice" };

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = parseId(raw);
  if (id === null) notFound();
  const viewer = await requireRole("admin", `/admin/users/${id}`);
  const user = await getAdminUser(viewer, id);
  if (!user) notFound();
  const me = await getUserById(viewer.userId);
  const tz = me?.timezone ?? "UTC";

  return (
    <div className="flex flex-col gap-8">
      <p>
        <Link href="/admin/users" className="inline-flex min-h-11 items-center font-semibold text-lavender underline underline-offset-2 hover:text-cream">
          All users
        </Link>
      </p>
      <header className="flex flex-wrap items-center gap-4">
        <Avatar userId={user.userId} size={64} />
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold leading-tight [overflow-wrap:anywhere] [text-shadow:0_2px_0_var(--color-ink)]">
            {user.displayName}
          </h1>
          <p className="text-lavender [overflow-wrap:anywhere]">
            @{user.username} &middot; trust {Math.round(user.trustScore)}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusChip status={user.status} />
            <RoleChips roles={user.roles} />
          </div>
        </div>
      </header>

      <Window title="Roles">
        <p className="mb-4 text-[15px] text-lavender">
          Changes apply at once and are written to the audit log. No reason is needed.
        </p>
        <RoleControls userId={user.userId} name={user.displayName} roles={user.roles} />
      </Window>

      <Window title={`Sanction history (${user.sanctions.length})`}>
        <SanctionHistory sanctions={user.sanctions} timeZone={tz} />
      </Window>

      <Window title="Recent reports against them">
        <RecentReports reports={user.reports} timeZone={tz} />
      </Window>
    </div>
  );
}
