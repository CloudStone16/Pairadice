"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { CampActionState } from "@/app/(hearth)/camp/[sessionId]/actions";

/**
 * A success message outlives the control that produced it: the page revalidates and the button (or the whole
 * form) unmounts. So results are published to one region that stays mounted (CampStatusRegion, rendered by
 * CampBanner) and focus moves there, instead of being lost to <body>.
 */
export const CAMP_STATUS_ID = "camp-status";

let message = "";
let regions = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** The persistent live region. Focusable (tabIndex -1) so a control that disappears can hand focus to it. */
export function CampStatusRegion() {
  const text = useSyncExternalStore(subscribe, () => message, () => "");
  useEffect(() => {
    regions += 1;
    emit();
    return () => {
      regions -= 1;
      message = "";
      emit();
    };
  }, []);
  return (
    <p
      id={CAMP_STATUS_ID}
      role="status"
      tabIndex={-1}
      className={text ? "mt-3 text-sm font-semibold text-wood-dark" : "sr-only"}
    >
      {text}
    </p>
  );
}

/**
 * Wrap a camp action so a success is published to the persistent region (and focus moves there) from inside the
 * action. The page revalidates in the same transition as the action result, so a control that disappears never
 * gets to run an effect keyed on its own state. Writes to a module store, not to a parent's React state.
 */
export function withCampResult(
  action: (prev: CampActionState, fd: FormData) => Promise<CampActionState>,
): (prev: CampActionState, fd: FormData) => Promise<CampActionState> {
  return async (prev, fd) => {
    const result = await action(prev, fd);
    if (result?.ok && regions > 0) {
      message = result.message;
      emit();
      document.getElementById(CAMP_STATUS_ID)?.focus();
    }
    return result;
  };
}

/** Whether the persistent region exists (when it does not, the control shows its own success message). */
export function useCampRegion(): boolean {
  return useSyncExternalStore(subscribe, () => regions > 0, () => false);
}
