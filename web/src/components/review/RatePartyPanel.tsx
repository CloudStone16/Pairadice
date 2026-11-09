import { Sprite, Window } from "@/components/ui";
import type { Viewer } from "@/lib/auth/viewer";
import { getPendingReviews } from "@/lib/mutations/review";
import { ReviewForm } from "./ReviewForm";

/** "Rate your party": one small form per teammate still to review. Renders nothing when there are none. */
export async function RatePartyPanel({ sessionId, viewer }: { sessionId: number; viewer: Viewer | null }) {
  const pending = await getPendingReviews(viewer, sessionId);
  if (pending.length === 0) return null;
  return (
    <Window title="Rate your party">
      <p className="mb-4 text-base text-lavender">How was the company? Reviews are public and help others pick a party.</p>
      <ul role="list" className="flex flex-col gap-4">
        {pending.map((p) => (
          <li key={p.userId} className="rounded-frame bg-ink/30 p-4">
            <ReviewForm sessionId={sessionId} reviewedId={p.userId} name={p.displayName} />
          </li>
        ))}
      </ul>
    </Window>
  );
}

/** Shown after the last teammate was rated (?rated=1), when the panel itself has gone. */
export function RatedNotice({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p role="status" className="flex items-start gap-2 rounded-frame bg-plum-2 p-3 font-semibold ring-1 ring-inset ring-lavender/50">
      <Sprite name="icon-check" className="mt-0.5" />
      Thanks, your party is rated.
    </p>
  );
}
