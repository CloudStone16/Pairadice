"use client";

import { runExpiry } from "@/app/(hearth)/mod/actions";
import { ActionForm } from "./ActionForm";

/** "Run expiry now": sp_expire_sanctions on demand (nothing schedules it). */
export function ExpiryForm() {
  return (
    <ActionForm
      action={runExpiry}
      id="expiry"
      submitLabel="Run expiry now"
      pendingLabel="Running expiry"
      icon="icon-hourglass"
      variant="ghost"
      surface="plum"
    />
  );
}
