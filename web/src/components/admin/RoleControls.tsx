"use client";

import { useActionState } from "react";
import { PendingButton, Sprite } from "@/components/ui";
import { grantRole, revokeRole } from "@/app/(hearth)/admin/users/actions";
import { INITIAL_MOD_STATE, ROLE_NAMES, type RoleName } from "@/lib/moderation/types";

function RoleForm({
  action,
  userId,
  role,
  verb,
  variant,
  name,
}: {
  action: typeof grantRole;
  userId: number;
  role: RoleName;
  verb: "Grant" | "Revoke";
  variant: "green" | "red";
  name: string;
}) {
  const [state, formAction, pending] = useActionState(action, INITIAL_MOD_STATE);
  return (
    <form action={formAction} className="flex flex-col gap-1">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="role" value={role} />
      <PendingButton
        type="submit"
        size="sm"
        variant={variant}
        pending={pending}
        pendingLabel={`${verb === "Grant" ? "Granting" : "Revoking"} ${role}`}
        aria-label={`${verb} ${role} ${verb === "Grant" ? "to" : "from"} ${name}`}
      >
        <Sprite name={verb === "Grant" ? "icon-user-add" : "icon-user-remove"} />
        {verb} {role}
      </PendingButton>
      <p role="status" className={state.status === "saved" ? "text-[15px] font-semibold" : "sr-only"}>
        {state.status === "saved" ? state.message : ""}
      </p>
      {state.status === "error" ? (
        <p role="alert" className="flex max-w-xs items-start gap-2 text-[15px] font-semibold">
          <Sprite name="icon-warning" className="mt-0.5" />
          <span>{state.message}</span>
        </p>
      ) : null}
    </form>
  );
}

/** Role badges with Grant and Revoke forms. Each is its own form, so it works without JavaScript. */
export function RoleControls({ userId, name, roles }: { userId: number; name: string; roles: RoleName[] }) {
  return (
    <ul role="list" className="grid gap-3 sm:grid-cols-3">
      {ROLE_NAMES.map((role) => {
        const has = roles.includes(role);
        return (
          <li key={role} className="flex flex-col items-start gap-2 rounded-frame bg-ink/30 p-3">
            <p className="font-display text-lg font-semibold capitalize">{role}</p>
            <p className="text-[15px] text-lavender">{has ? "Has this role" : "Does not have this role"}</p>
            {has ? (
              role === "player" ? (
                <p className="text-[15px] text-lavender">The player role cannot be removed.</p>
              ) : (
                <RoleForm action={revokeRole} userId={userId} role={role} verb="Revoke" variant="red" name={name} />
              )
            ) : (
              <RoleForm action={grantRole} userId={userId} role={role} verb="Grant" variant="green" name={name} />
            )}
          </li>
        );
      })}
    </ul>
  );
}
