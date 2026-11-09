"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import {
  acceptAction,
  blockAction,
  cancelRequestAction,
  declineAction,
  removeFriendAction,
  sendRequestAction,
  unblockAction,
  type SocialActionState,
} from "@/app/(hearth)/friends/actions";
import { Button, PendingButton, Sprite, type ButtonVariant } from "@/components/ui";
import type { SpriteName } from "@/lib/sprite-names";
import { useSocialReport } from "./SocialStatus";

export type SocialKind = "send" | "accept" | "decline" | "cancel" | "remove" | "block" | "unblock";

interface KindDef {
  action: (prev: SocialActionState, fd: FormData) => Promise<SocialActionState>;
  label: string;
  icon: SpriteName;
  variant: ButtonVariant;
  confirm?: (name: string) => { prompt: string; yes: string };
}

const KINDS: Record<SocialKind, KindDef> = {
  send: { action: sendRequestAction, label: "Add friend", icon: "icon-user-add", variant: "yellow" },
  accept: { action: acceptAction, label: "Accept", icon: "icon-accept", variant: "green" },
  decline: { action: declineAction, label: "Decline", icon: "icon-decline", variant: "ghost" },
  cancel: { action: cancelRequestAction, label: "Cancel request", icon: "icon-decline", variant: "ghost" },
  remove: {
    action: removeFriendAction,
    label: "Remove",
    icon: "icon-user-remove",
    variant: "red",
    confirm: (n) => ({ prompt: `Remove ${n} from your friends?`, yes: "Yes, remove" }),
  },
  block: {
    action: blockAction,
    label: "Block",
    icon: "icon-block",
    variant: "red",
    confirm: (n) => ({
      prompt: `Block ${n}? They will not see your quests and you will not see theirs.`,
      yes: "Yes, block",
    }),
  },
  unblock: { action: unblockAction, label: "Unblock", icon: "icon-unblock", variant: "blue" },
};

/** One friends/blocks action as a button for one player. Results go to the nearest SocialStatus. */
export function SocialAction({
  kind,
  userId,
  name,
  size = "sm",
}: {
  kind: SocialKind;
  userId: number;
  /** The player's display name, used in the accessible label and the confirm prompt. */
  name: string;
  size?: "sm" | "md";
}) {
  const def = KINDS[kind];
  const report = useSocialReport();
  // stable identity: only changes when the action, the reporter or the player's name does
  const wrapped = useMemo(
    () =>
      async (prev: SocialActionState, fd: FormData): Promise<SocialActionState> => {
        const r = await def.action(prev, fd);
        if (r) report({ ok: r.ok, message: r.ok ? `${name}: ${r.message}` : r.message });
        return r;
      },
    [def, report, name],
  );
  const [state, formAction, pending] = useActionState(wrapped, null);
  const [askedAt, setAskedAt] = useState<{ at: SocialActionState } | null>(null);
  const asking = askedAt !== null && askedAt.at === state;
  const box = useRef<HTMLDivElement>(null);
  const wasAsking = useRef(false);

  useEffect(() => {
    if (asking) box.current?.querySelector<HTMLElement>("[data-no]")?.focus();
    else if (wasAsking.current) box.current?.querySelector<HTMLElement>("[data-trigger]")?.focus();
    wasAsking.current = asking;
  }, [asking]);

  const accessible = `${def.label}: ${name}`;
  const confirm = def.confirm?.(name);
  const hidden = <input type="hidden" name="userId" value={userId} />;

  return (
    <div ref={box} aria-busy={pending ? true : undefined} className="flex flex-col gap-2">
      {confirm && asking ? (
        <form
          action={formAction}
          role="group"
          aria-label={`Confirm: ${accessible}`}
          onKeyDown={(e) => {
            if (e.key === "Escape") setAskedAt(null);
          }}
          className="flex max-w-sm flex-col gap-2 rounded-frame border-2 border-dashed border-current p-3 text-left"
        >
          {hidden}
          <p className="text-sm font-semibold">{confirm.prompt}</p>
          <div className="flex flex-wrap gap-2">
            <PendingButton
              type="submit"
              variant="red"
              size="sm"
              pending={pending}
              pendingLabel={`Working on ${name}`}
              aria-label={`${confirm.yes}: ${name}`}
            >
              {confirm.yes}
            </PendingButton>
            <Button
              data-no=""
              type="button"
              variant="ghost"
              size="sm"
              aria-disabled={pending ? true : undefined}
              onClick={() => {
                if (!pending) setAskedAt(null);
              }}
            >
              Never mind
            </Button>
          </div>
        </form>
      ) : (
        <form action={confirm ? undefined : formAction} onSubmit={confirm ? (e) => e.preventDefault() : undefined}>
          {hidden}
          <PendingButton
            data-trigger=""
            type={confirm ? "button" : "submit"}
            variant={def.variant}
            size={size}
            pending={pending}
            pendingLabel={`Working on ${name}`}
            aria-label={accessible}
            onClick={confirm ? () => setAskedAt({ at: state }) : undefined}
          >
            <Sprite name={def.icon} />
            {def.label}
          </PendingButton>
        </form>
      )}
    </div>
  );
}
