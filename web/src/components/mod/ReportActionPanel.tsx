"use client";

import type { ReactNode } from "react";
import { issueSanction, moderateMessage, resolveReport } from "@/app/(hearth)/mod/actions";
import { Field, ariaFor, controlClasses } from "@/components/quest/Field";
import { Window } from "@/components/ui";
import { MOD_LIMITS, SANCTION_DAYS, type SanctionType } from "@/lib/moderation/types";
import { ActionForm, type ActionFormCtx } from "./ActionForm";

function Reason({ ctx, name = "reason", label, max }: { ctx: ActionFormCtx; name?: string; label: string; max: number }) {
  const id = ctx.fid(name);
  return (
    <Field id={id} label={label} error={ctx.fe[name]}>
      <input
        id={id}
        name={name}
        required
        aria-required="true"
        minLength={MOD_LIMITS.sanctionReasonMin}
        maxLength={max}
        autoComplete="off"
        defaultValue={ctx.str(name)}
        className={controlClasses}
        {...ariaFor(id, { error: ctx.fe[name] })}
      />
    </Field>
  );
}

function Days({ ctx }: { ctx: ActionFormCtx }) {
  const id = ctx.fid("days");
  return (
    <Field id={id} label="For how long" error={ctx.fe.days}>
      <select id={id} name="days" required aria-required="true" defaultValue={ctx.str("days", "1")} className={controlClasses} {...ariaFor(id, { error: ctx.fe.days })}>
        {SANCTION_DAYS.map((d) => (
          <option key={d} value={d}>
            {d} {d === 1 ? "day" : "days"}
          </option>
        ))}
      </select>
    </Field>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <Window title={title} titleAs="h3" variant="parchment">
      {note ? <p className="mb-3 text-[15px] text-wood-dark">{note}</p> : null}
      {children}
    </Window>
  );
}

function SanctionPanel({
  type,
  title,
  note,
  reportId,
  userId,
  withDays,
  confirm,
  submitLabel,
  confirmLabel,
  icon,
}: {
  type: SanctionType;
  title: string;
  note: string;
  reportId: number;
  userId: number;
  withDays: boolean;
  confirm: boolean;
  submitLabel: string;
  confirmLabel?: string;
  icon: "icon-warning" | "icon-mute" | "icon-hourglass" | "icon-ban";
}) {
  return (
    <Panel title={title} note={note}>
      <ActionForm
        action={issueSanction}
        id={`sanction-${type}`}
        submitLabel={submitLabel}
        confirmLabel={confirm ? confirmLabel : undefined}
        pendingLabel={`Issuing the ${type}`}
        icon={icon}
        variant={type === "warn" ? "yellow" : "red"}
        hidden={
          <>
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="reportId" value={reportId} />
          </>
        }
      >
        {(ctx) => (
          <>
            {withDays ? <Days ctx={ctx} /> : null}
            <Reason ctx={ctx} label="Reason (the player sees this)" max={MOD_LIMITS.sanctionReasonMax} />
          </>
        )}
      </ActionForm>
    </Panel>
  );
}

/**
 * Everything a moderator can do from a report. Each action is a small form with a required reason; suspend
 * and ban ask for a second press. A sanction closes the report as actioned in the same procedure.
 */
export function ReportActionPanel({
  reportId,
  reportedUserId,
  reportedName,
  canBan,
  message,
}: {
  reportId: number;
  reportedUserId: number;
  reportedName: string;
  canBan: boolean;
  message: { messageId: number; hidden: boolean } | null;
}) {
  return (
    <div className="grid gap-x-6 gap-y-8 md:grid-cols-2">
      <Panel title="Dismiss" note="Close the report with no action. The reason stays in the audit log.">
        <ActionForm
          action={resolveReport}
          id="dismiss"
          submitLabel="Dismiss report"
          pendingLabel="Dismissing the report"
          icon="icon-decline"
          variant="blue"
          hidden={
            <>
              <input type="hidden" name="reportId" value={reportId} />
              <input type="hidden" name="outcome" value="dismissed" />
            </>
          }
        >
          {(ctx) => <Reason ctx={ctx} name="note" label="Why it is dismissed" max={MOD_LIMITS.resolveNote} />}
        </ActionForm>
      </Panel>
      <SanctionPanel type="warn" title="Warn" note={`A recorded warning for ${reportedName}. No restriction.`} reportId={reportId} userId={reportedUserId} withDays={false} confirm={false} submitLabel="Issue warning" icon="icon-warning" />
      <SanctionPanel type="mute" title="Mute" note="They can still play but cannot send messages." reportId={reportId} userId={reportedUserId} withDays confirm={false} submitLabel="Mute player" icon="icon-mute" />
      <SanctionPanel type="suspend" title="Suspend" note="They cannot sign in to play until it ends. Needs a second press to confirm." reportId={reportId} userId={reportedUserId} withDays confirm submitLabel="Suspend player" confirmLabel="Yes, suspend" icon="icon-hourglass" />
      {canBan ? (
        <SanctionPanel type="ban" title="Ban" note="Permanent. Only an admin can lift it. Needs a second press to confirm." reportId={reportId} userId={reportedUserId} withDays={false} confirm submitLabel="Ban player" confirmLabel="Yes, ban permanently" icon="icon-ban" />
      ) : null}
      {message ? (
        <Panel
          title={message.hidden ? "Restore message" : "Hide message"}
          note={message.hidden ? "Show the reported message to the party again." : "Hide the reported message from chat. Staff can still read it here."}
        >
          <ActionForm
            action={moderateMessage}
            id="message"
            submitLabel={message.hidden ? "Restore message" : "Hide message"}
            pendingLabel={message.hidden ? "Restoring the message" : "Hiding the message"}
            icon={message.hidden ? "icon-restore" : "icon-hide-message"}
            variant={message.hidden ? "green" : "yellow"}
            hidden={
              <>
                <input type="hidden" name="messageId" value={message.messageId} />
                <input type="hidden" name="hide" value={message.hidden ? "0" : "1"} />
                <input type="hidden" name="reportId" value={reportId} />
              </>
            }
          />
        </Panel>
      ) : null}
    </div>
  );
}
