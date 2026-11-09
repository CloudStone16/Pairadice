import type { Metadata } from "next";
import { UserList } from "@/components/admin/UserList";
import { Button, Sprite, Window } from "@/components/ui";
import { requireRole } from "@/lib/auth/guards";
import { USER_LIST_LIMIT, listAdminUsers } from "@/lib/queries-admin";

export const metadata: Metadata = { title: "Users and roles | PairADice" };

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const viewer = await requireRole("admin", "/admin/users");
  const { q: rawQ } = await searchParams;
  const q = (Array.isArray(rawQ) ? rawQ[0] : rawQ)?.trim().slice(0, 32) ?? "";
  const users = await listAdminUsers(viewer, q);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-bold [text-shadow:0_2px_0_var(--color-ink)]">Users and roles</h1>
        <p className="text-lavender">Find a player, see their record, and decide who holds a moderator or admin hat.</p>
      </header>

      <Window title="Find a player">
        <form method="get" action="/admin/users" role="search" className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label htmlFor="user-search" className="text-[15px] font-semibold">
              Username or display name
            </label>
            <input
              id="user-search"
              name="q"
              type="search"
              defaultValue={q}
              maxLength={32}
              autoComplete="off"
              className="min-h-11 w-full rounded-chip border-2 border-ink bg-[#fbf5e6] px-3 py-2 text-base text-ink"
            />
          </div>
          <Button type="submit" variant="blue">
            <Sprite name="icon-search" />
            Search
          </Button>
        </form>
      </Window>

      <section aria-labelledby="users-h" className="flex flex-col gap-3">
        <h2 id="users-h" className="font-display text-2xl font-bold" aria-live="polite">
          {q ? `Results for “${q}”` : "All players"} ({users.length}
          {users.length === USER_LIST_LIMIT ? "+" : ""})
        </h2>
        {users.length === 0 ? (
          <p className="text-lavender">No one by that name. Try fewer letters.</p>
        ) : (
          <UserList users={users} />
        )}
        {users.length === USER_LIST_LIMIT ? (
          <p className="text-[15px] text-lavender">Showing the first {USER_LIST_LIMIT}. Narrow the search to see others.</p>
        ) : null}
      </section>
    </div>
  );
}
