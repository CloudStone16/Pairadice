import { Suspense } from "react";
import { setDevUser } from "@/app/actions/dev-user";
import { isDevAuthEnabled } from "@/lib/dev-user";
import { getAllUsers } from "@/lib/queries";

async function DevUserForm({ currentId }: { currentId: number }) {
  const users = await getAllUsers();
  if (users.length === 0) return null;
  return (
    <div className="border-b border-lavender/20 bg-ink text-sm text-cream">
      {/* keyed on the current id so the select resets after a switch */}
      <form
        key={currentId}
        action={setDevUser}
        className="mx-auto flex max-w-[1680px] flex-nowrap items-center justify-end gap-2 px-4 py-0.5"
      >
        <label htmlFor="dev-user" className="shrink-0 font-display text-xs font-semibold tracking-wide text-ember sm:text-sm">
          Dev: play as
        </label>
        <select
          key={currentId}
          id="dev-user"
          name="userId"
          defaultValue={currentId}
          className="min-w-0 max-w-[11rem] rounded-chip bg-plum px-2 py-0.5 text-cream ring-1 ring-lavender/50"
        >
          {users.map((u) => (
            <option key={u.user_id} value={u.user_id}>
              {u.user_id} &middot; {u.username}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="shrink-0 rounded-pill bg-ember px-3 py-0.5 font-display font-semibold text-ink transition hover:brightness-110 active:translate-y-px"
        >
          Switch
        </button>
      </form>
    </div>
  );
}

/** DEV-ONLY "play as" control. Renders nothing unless `next dev` runs with PAIRADICE_DEV_AUTH=1. */
export function DevUserSwitch({ currentId }: { currentId: number }) {
  if (!isDevAuthEnabled()) return null;
  return (
    <Suspense fallback={null}>
      <DevUserForm currentId={currentId} />
    </Suspense>
  );
}
