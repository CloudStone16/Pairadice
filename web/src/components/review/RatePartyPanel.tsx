import { Window } from "@/components/ui";
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
