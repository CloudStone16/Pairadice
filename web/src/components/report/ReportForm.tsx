"use client";

import { useActionState, useId, useState } from "react";
import { FormAlert, type FormAlertItem } from "@/components/auth/FormAlert";
import { PendingButton, Sprite } from "@/components/ui";
import { reportUser } from "@/app/(hearth)/report/actions";
import { INITIAL_MOD_STATE, MOD_LIMITS, REPORT_CATEGORIES } from "@/lib/moderation/types";
import { CATEGORY_LABELS } from "@/lib/report/validate";

const field =
  "w-full rounded-chip border-2 border-ink bg-[#fbf5e6] px-3 py-2 text-base text-ink shadow-[inset_0_2px_0_rgb(18_14_31/0.12)] placeholder:text-wood-dark aria-invalid:border-[#8a2621] aria-invalid:bg-[#fff1ec]";

/** Report form. A plain <form action>, so it posts without JavaScript; the counter is an enhancement. */
export function ReportForm({
  reportedId,
  name,
  session,
  message,
  back,
}: {
  reportedId: number;
  name: string;
  session: string;
  message: string;
  back: string;
}) {
  const [state, formAction, pending] = useActionState(reportUser, INITIAL_MOD_STATE);
  const id = useId();
  const v = state.values ?? {};
  const [text, setText] = useState(v.description ?? "");
  const errors = state.fieldErrors ?? {};
  const catErr = errors.category;
  const descErr = errors.description;
  const items: FormAlertItem[] = [
    ...(catErr ? [{ id: `${id}-cat-0`, text: catErr }] : []),
    ...(descErr ? [{ id: `${id}-desc`, text: descErr }] : []),
  ];
  const left = MOD_LIMITS.reportDescription - text.length;

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="reportedId" value={reportedId} />
      <input type="hidden" name="session" value={session} />
      <input type="hidden" name="message" value={message} />
      <input type="hidden" name="back" value={back} />

      <FormAlert message={state.status === "error" ? state.message : undefined} items={items} focusKey={state} />

      <fieldset aria-describedby={catErr ? `${id}-cat-err` : undefined} className="min-w-0">
        <legend className="mb-2 font-display text-lg font-semibold">What happened with {name}?</legend>
        <div className="flex flex-col gap-2">
          {REPORT_CATEGORIES.map((c, i) => (
            <label
              key={c}
              className="flex min-h-11 cursor-pointer items-start gap-3 rounded-frame bg-ink/30 p-3 has-[:checked]:bg-plum-2 has-[:checked]:ring-2 has-[:checked]:ring-ember"
            >
              <input
                id={`${id}-cat-${i}`}
                type="radio"
                name="category"
                value={c}
                required
                defaultChecked={v.category === c}
                className="mt-1 size-5 shrink-0 accent-[#f2a65a]"
              />
              <span className="leading-tight">
                <span className="block font-display font-semibold">{CATEGORY_LABELS[c].label}</span>
                <span className="block text-[15px] text-lavender">{CATEGORY_LABELS[c].hint}</span>
              </span>
            </label>
          ))}
        </div>
        {catErr ? (
          <p id={`${id}-cat-err`} className="mt-2 flex items-start gap-2 font-semibold">
            <Sprite name="icon-warning" className="mt-0.5" />
            {catErr}
          </p>
        ) : null}
      </fieldset>

      <div>
        <label htmlFor={`${id}-desc`} className="mb-1 block font-display text-lg font-semibold">
          Tell the moderators more <span className="text-[15px] font-normal text-lavender">(optional)</span>
        </label>
        <textarea
          id={`${id}-desc`}
          name="description"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MOD_LIMITS.reportDescription}
          aria-invalid={descErr ? true : undefined}
          aria-describedby={`${id}-count${descErr ? ` ${id}-desc-err` : ""}`}
          className={field}
        />
        <p id={`${id}-count`} className="mt-1 text-[15px] text-lavender">
          <span className={left < 50 ? "font-semibold text-cream" : ""}>
            {text.length} / {MOD_LIMITS.reportDescription} characters
          </span>
        </p>
        {descErr ? (
          <p id={`${id}-desc-err`} className="mt-1 flex items-start gap-2 font-semibold">
            <Sprite name="icon-warning" className="mt-0.5" />
            {descErr}
          </p>
        ) : null}
      </div>

      <div>
        <PendingButton type="submit" variant="red" pending={pending} pendingLabel="Sending your report">
          <Sprite name="icon-flag" />
          {pending ? "Sending..." : "Send report"}
        </PendingButton>
      </div>
    </form>
  );
}
