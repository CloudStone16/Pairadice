"use client";

import { useActionState, useId, useState } from "react";
import { PendingButton, Sprite } from "@/components/ui";
import { writeReview } from "@/app/(hearth)/camp/[sessionId]/review-actions";
import { CHAT_LIMITS, INITIAL_CHAT_STATE } from "@/lib/chat/types";

const field =
  "w-full rounded-chip border-2 border-ink bg-[#fbf5e6] px-3 py-2 text-base text-ink shadow-[inset_0_2px_0_rgb(18_14_31/0.12)] aria-invalid:border-[#8a2621] aria-invalid:bg-[#fff1ec]";

/** One teammate's review form. A plain <form action>, so it posts without JavaScript. */
export function ReviewForm({ sessionId, reviewedId, name }: { sessionId: number; reviewedId: number; name: string }) {
  const [state, formAction, pending] = useActionState(writeReview, INITIAL_CHAT_STATE);
  const id = useId();
  const v = state.values ?? {};
  const errors = state.fieldErrors ?? {};
  const [text, setText] = useState(v.comment ?? "");
  const ratingErr = errors.rating;
  const commentErr = errors.comment;
  const generalErr = state.status === "error" && !ratingErr && !commentErr ? state.message : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="reviewedId" value={reviewedId} />

      <fieldset className="min-w-0" aria-describedby={ratingErr ? `${id}-rating-err` : undefined}>
        <legend className="mb-2 font-display text-lg font-semibold">How was {name}?</legend>
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <label
              key={n}
              className="flex min-h-11 min-w-14 cursor-pointer items-center justify-center gap-1.5 rounded-chip bg-plum-2 px-3 font-display font-semibold has-[:checked]:bg-wood has-[:checked]:ring-2 has-[:checked]:ring-ember"
            >
              <input
                type="radio"
                name="rating"
                value={n}
                required
                defaultChecked={v.rating === String(n)}
                className="size-5 shrink-0 accent-[#f2a65a]"
              />
              <span aria-hidden="true">{n}</span>
              <Sprite name="icon-star" />
              <span className="sr-only">{n === 1 ? "1 star" : `${n} stars`}</span>
            </label>
          ))}
        </div>
        {ratingErr ? (
          <p id={`${id}-rating-err`} className="mt-2 flex items-start gap-2 font-semibold">
            <Sprite name="icon-warning" className="mt-0.5" />
            {ratingErr}
          </p>
        ) : null}
      </fieldset>

      <div>
        <label htmlFor={`${id}-comment`} className="mb-1 block text-base font-semibold">
          Comment <span className="font-normal text-lavender">(optional)</span>
        </label>
        <textarea
          id={`${id}-comment`}
          name="comment"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={CHAT_LIMITS.reviewCommentMax}
          aria-invalid={commentErr ? true : undefined}
          aria-describedby={`${id}-count${commentErr ? ` ${id}-comment-err` : ""}`}
          className={field}
        />
        <p id={`${id}-count`} className="mt-1 text-[15px] text-lavender">
          {text.length} / {CHAT_LIMITS.reviewCommentMax} characters
        </p>
        {commentErr ? (
          <p id={`${id}-comment-err`} className="mt-1 flex items-start gap-2 font-semibold">
            <Sprite name="icon-warning" className="mt-0.5" />
            {commentErr}
          </p>
        ) : null}
      </div>

      <div aria-live="polite" role="status" className="text-base font-semibold empty:hidden">
        {state.status === "sent" ? state.message : null}
      </div>
      {generalErr ? (
        <p role="alert" className="flex items-start gap-2 font-semibold">
          <Sprite name="icon-warning" className="mt-0.5" />
          {generalErr}
        </p>
      ) : null}

      <div>
        <PendingButton type="submit" pending={pending} pendingLabel="Sending your review">
          {pending ? "Sending..." : "Send review"}
        </PendingButton>
      </div>
    </form>
  );
}
