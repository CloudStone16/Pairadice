"use client";

import { useActionState, useId } from "react";
import {
  requestJoinAction,
  setSessionStatusAction,
  withdrawOrLeaveAction,
  type CampActionState,
} from "@/app/(hearth)/camp/[sessionId]/actions";
import { FormAlert } from "@/components/auth/FormAlert";
import { ActionControl } from "@/components/camp/ActionControl";
import { useCampRegion, withCampResult } from "@/components/camp/CampStatus";
import { PendingButton, Sprite } from "@/components/ui";
import type { SessionStatus } from "@/lib/types";
import type { ViewerRole } from "./CampBanner";

export interface JoinRoleOption {
  id: number;
  name: string;
}
export interface JoinAccountOption {
  id: number;
  label: string;
}

const requestJoin = withCampResult(requestJoinAction);

const selectClasses =
  "min-h-11 w-full rounded-chip border-2 border-ink bg-[#fbf5e6] px-3 py-2 text-base text-ink shadow-[inset_0_2px_0_rgb(18_14_31/0.12)]";

function KnockForm({
  sessionId,
  roles,
  accounts,
  auto,
}: {
  sessionId: number;
  roles: JoinRoleOption[];
  accounts: JoinAccountOption[];
  auto: boolean;
}) {
  const [state, formAction, pending] = useActionState<CampActionState, FormData>(requestJoin, null);
  const uid = useId();
  const hasRegion = useCampRegion();
  return (
    <form action={formAction} className="flex max-w-xl flex-col gap-3">
      <input type="hidden" name="sessionId" value={sessionId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${uid}-role`} className="text-sm font-semibold">
            Role you will play
          </label>
          <select id={`${uid}-role`} name="roleId" required defaultValue="" className={selectClasses}>
            <option value="" disabled>
              Choose a role
            </option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        {accounts.length > 0 ? (
          <div className="flex flex-col gap-1">
            <label htmlFor={`${uid}-acct`} className="text-sm font-semibold">
              Platform account
            </label>
            <select id={`${uid}-acct`} name="accountId" defaultValue={accounts[0]?.id} className={selectClasses}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <PendingButton type="submit" variant="yellow" pending={pending} pendingLabel="Knocking">
          <Sprite name="icon-knock" />
          Knock to join
        </PendingButton>
        <p className="text-sm text-wood-dark">
          {auto ? "This camp lets everyone in straight away." : "The host decides whether to let you in."}
        </p>
      </div>
      <FormAlert message={state && !state.ok ? state.message : undefined} />
      {hasRegion ? null : (
        <p role="status" className={`text-sm text-wood-dark ${state?.ok ? "" : "sr-only"}`}>
          {state?.ok ? state.message : ""}
        </p>
      )}
    </form>
  );
}

/** Context-aware buttons for the camp banner. Renders nothing when the viewer has no action to take. */
export function CampActions({
  sessionId,
  status,
  role,
  roles,
  accounts,
  auto,
}: {
  sessionId: number;
  status: SessionStatus;
  role: ViewerRole;
  roles: JoinRoleOption[];
  accounts: JoinAccountOption[];
  auto: boolean;
}) {
  const ids = { sessionId };
  const light = "light" as const;

  if (role === "none") {
    if (status !== "open") return null;
    return <KnockForm sessionId={sessionId} roles={roles} accounts={accounts} auto={auto} />;
  }
  if (role === "knocking") {
    return (
      <ActionControl
        action={withdrawOrLeaveAction}
        fields={ids}
        label="Withdraw request"
        variant="ghost"
        surface={light}
      />
    );
  }
  if (role === "member") {
    if (status === "completed" || status === "cancelled") return null;
    return (
      <ActionControl
        action={withdrawOrLeaveAction}
        fields={ids}
        label="Leave party"
        icon="icon-leave"
        variant="red"
        surface={light}
        confirm={{ prompt: "Leave this party? Your seat will open up for someone else.", yes: "Yes, leave", no: "Stay" }}
      />
    );
  }
  // host
  const canStart = status === "open" || status === "full";
  const canCancel = status === "open" || status === "full" || status === "in_progress";
  const canComplete = status === "in_progress";
  if (!canStart && !canCancel && !canComplete) return null;
  return (
    <div className="flex flex-wrap items-start gap-3">
      {canStart ? (
        <ActionControl
          action={setSessionStatusAction}
          fields={{ ...ids, status: "in_progress" }}
          label="Start quest"
          variant="green"
          surface={light}
        />
      ) : null}
      {canComplete ? (
        <ActionControl
          action={setSessionStatusAction}
          fields={{ ...ids, status: "completed" }}
          label="Complete quest"
          variant="green"
          surface={light}
        />
      ) : null}
      {canCancel ? (
        <ActionControl
          action={setSessionStatusAction}
          fields={{ ...ids, status: "cancelled" }}
          label="Cancel quest"
          variant="red"
          surface={light}
          confirm={{ prompt: "Cancel this quest for everyone? This cannot be undone.", yes: "Yes, cancel it", no: "Keep quest" }}
        />
      ) : null}
    </div>
  );
}
