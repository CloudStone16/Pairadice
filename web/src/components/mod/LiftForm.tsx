"use client";

import { liftSanction } from "@/app/(hearth)/mod/actions";
import { controlClasses, ariaFor } from "@/components/quest/Field";
import { MOD_LIMITS } from "@/lib/moderation/types";
import { ActionForm } from "./ActionForm";

/** Lift a sanction early with a reason (sp_lift_sanction). Sits inside the sanctions table (plum surface). */
export function LiftForm({ sanctionId, who }: { sanctionId: number; who: string }) {
  return (
    <ActionForm
      action={liftSanction}
      id={`lift-${sanctionId}`}
      submitLabel="Lift"
      buttonName={`Lift sanction ${sanctionId} on ${who}`}
      pendingLabel="Lifting the sanction"
      icon="icon-lift"
      variant="blue"
      size="sm"
      surface="plum"
      hidden={<input type="hidden" name="sanctionId" value={sanctionId} />}
    >
      {({ fe, str, fid }) => (
        <div>
          <label htmlFor={fid("reason")} className="mb-1 block font-display text-sm font-semibold text-lavender">
            Reason to lift
          </label>
          <input
            id={fid("reason")}
            name="reason"
            required
            aria-required="true"
            maxLength={MOD_LIMITS.liftReasonMax}
            defaultValue={str("reason")}
            className={controlClasses}
            {...ariaFor(fid("reason"), { error: fe.reason })}
          />
          {fe.reason ? (
            <p id={`${fid("reason")}-error`} className="mt-1 text-[15px] font-semibold text-[#ffb4ad]">
              <span className="sr-only">Error: </span>
              {fe.reason}
            </p>
          ) : null}
        </div>
      )}
    </ActionForm>
  );
}
