import { Suspense } from "react";
import { setDevUser } from "@/app/actions/dev-user";
import { isDevAuthEnabled } from "@/lib/dev-user";
import { getAllUsers } from "@/lib/queries";

async function DevUserForm({ currentId }: { currentId: number | null }) {
  const users = await getAllUsers();
  if (users.length === 0) return null;
  return (
    <div className="border-b border-lavender/20 bg-ink text-sm text-cream">
      {/* keyed on the current id so the select resets after a switch */}
      <form
        key={currentId ?? "none"}
        action={setDevUser}
        className="mx-auto flex max-w-[1680px] flex-nowrap items-center justify-end gap-2 px-4 py-0.5"
      >
        <label htmlFor="dev-user" className="shrink-0 font-display text-sm font-semibold tracking-wide text-ember">
          Dev: play as
        </label>
        <select
          key={currentId ?? "none"}
          id="dev-user"
          name="userId"
          defaultValue={currentId ?? "none"}
          className="min-w-0 max-w-[11rem] min-h-6 rounded-chip bg-plum px-2 py-0.5 text-cream ring-1 ring-lavender/50"
        >
          <option value="none">Signed out</option>
          {users.map((u) => (
            <option key={u.user_id} value={u.user_id}>
              {u.user_id} &middot; {u.username}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="min-h-6 shrink-0 rounded-pill bg-ember px-3 py-0.5 font-display font-semibold text-ink transition hover:brightness-110 active:translate-y-px"
        >
          Switch
        </button>
      </form>
    </div>
  );
}

/**
 * DEV-ONLY "play as" control. Renders nothing unless `next dev` runs with PAIRADICE_DEV_AUTH=1,
 * and nothing while a real session is active (the HUD shows Sign out instead).
 */
export function DevUserSwitch({ currentId, realSession = false }: { currentId: number | null; realSession?: boolean }) {
  if (!isDevAuthEnabled() || realSession) return null;
  return (
    <Suspense fallback={null}>
      <DevUserForm currentId={currentId} />
    </Suspense>
  );
}
