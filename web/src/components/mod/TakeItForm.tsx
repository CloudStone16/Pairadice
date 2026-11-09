"use client";

import { claimReport } from "@/app/(hearth)/mod/actions";
import { ActionForm } from "./ActionForm";

/** "Take it": claim an open report (sp_claim_report). A form, so it works without JavaScript. */
export function TakeItForm({
  reportId,
  surface = "plum",
  size = "sm",
}: {
  reportId: number;
  surface?: "parchment" | "plum";
  size?: "sm" | "md";
}) {
  return (
    <ActionForm
      action={claimReport}
      id={`take-${reportId}`}
      submitLabel="Take it"
      buttonName={`Take it: report ${reportId}`}
      pendingLabel="Taking the report"
      icon="icon-claim"
      variant="green"
      size={size}
      surface={surface}
      hidden={<input type="hidden" name="reportId" value={reportId} />}
    />
  );
}
