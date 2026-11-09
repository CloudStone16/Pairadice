"use client";

import { useActionState } from "react";
import { deleteOwnMessage } from "@/app/(hearth)/chat/actions";
import { PendingButton } from "@/components/ui";
import { INITIAL_CHAT_STATE } from "@/lib/chat/types";

/** Delete one of your own lines. A plain form post without JS; shows the refusal inline otherwise. */
export function DeleteLineForm({ messageId, back }: { messageId: number; back: string }) {
  const [state, formAction, pending] = useActionState(deleteOwnMessage, INITIAL_CHAT_STATE);
  return (
    <form action={formAction} className="inline-flex flex-wrap items-center gap-2">
      <input type="hidden" name="messageId" value={messageId} />
      <input type="hidden" name="back" value={back} />
      <PendingButton type="submit" variant="ghost" size="sm" pending={pending} pendingLabel="Removing your message" className="!min-h-9">
        {pending ? "Removing..." : "Delete"}
      </PendingButton>
      {state.status === "error" ? (
        <span role="alert" className="text-sm font-semibold">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
