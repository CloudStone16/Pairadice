"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { FormAlert } from "@/components/auth/FormAlert";
import { PendingButton, Sprite, buttonClasses } from "@/components/ui";
import { INITIAL_PROFILE_STATE, type ProfileFormState } from "@/lib/profile/types";
import { useAnnounce } from "./RemoveScope";

/**
 * Two-step remove. Step one reveals the question and moves focus to Cancel (the safe choice);
 * Cancel or Escape hands focus back to the Remove button.
 */
export function ConfirmRemove({
  action,
  fieldName,
  value,
  label,
  ariaLabel,
  what,
  sectionId,
}: {
  action: (prev: ProfileFormState, formData: FormData) => Promise<ProfileFormState>;
  fieldName: string;
  value: number;
  label: string;
  /** Longer name for repeated buttons; starts with the visible label. */
  ariaLabel?: string;
  /** Id of the section wrapper; on success focus moves to its heading. */
  sectionId: string;
  /** Names the thing being removed, for the question. */
  what: string;
}) {
  const announce = useAnnounce();
  const questionId = useId();
  const [dismissed, setDismissed] = useState<ProfileFormState | null>(null);
  const wrapped = async (prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> => {
    const result = await action(prev, formData);
    if (result.status === "saved") {
      // This row unmounts once the page revalidates, so hand focus to the section heading first.
      const heading = document.getElementById(sectionId)?.querySelector<HTMLElement>("h2");
      if (heading) {
        heading.tabIndex = -1;
        heading.focus();
      }
      announce("Removed.");
    }
    return result;
  };
  const [state, formAction, pending] = useActionState(wrapped, INITIAL_PROFILE_STATE);
  const [confirming, setConfirming] = useState(false);
  const removeRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      removeRef.current?.focus();
    }
  }, [confirming]);

  function cancel() {
    returnFocus.current = true;
    setDismissed(state);
    setConfirming(false);
  }

  return (
    <div className="flex flex-col gap-2">
      <FormAlert
        message={state.status === "error" && dismissed !== state ? (state.message ?? "Could not remove that.") : undefined}
        focusKey={state}
        headingLevel={4}
      />
      {confirming ? (
        <form
          action={formAction}
          role="group"
          aria-labelledby={questionId}
          onKeyDown={(e) => {
            if (e.key === "Escape") cancel();
          }}
          className="flex flex-col gap-3 rounded-frame border-2 border-[#8a2621] bg-[#fff1ec] p-3"
        >
          <input type="hidden" name={fieldName} value={value} />
          <p id={questionId} className="text-base font-semibold text-[#6e1c18]">Remove {what}? This cannot be undone.</p>
          <div className="flex flex-wrap gap-3">
            <button ref={cancelRef} type="button" onClick={cancel} className={buttonClasses("ghost")}>
              Cancel
            </button>
            <PendingButton type="submit" variant="red" pending={pending} pendingLabel={`Removing ${what}`}>
              <Sprite name="icon-trash" />
              Yes, remove
            </PendingButton>
          </div>
        </form>
      ) : (
        <div>
          <button ref={removeRef} type="button" aria-label={ariaLabel} onClick={() => setConfirming(true)} className={buttonClasses("ghost")}>
            <Sprite name="icon-trash" />
            {label}
          </button>
        </div>
      )}
    </div>
  );
}
