// Pure validators for the review form (no server-only: unit-testable). sp_write_review stays the authority.
import { CHAT_LIMITS } from "@/lib/chat/types";

export type RawInput = Record<string, string | undefined>;
export interface ReviewInput {
  sessionId: number;
  reviewedId: number;
  rating: number;
  comment: string | null;
}
export type ReviewResult = { ok: true; value: ReviewInput } | { ok: false; fieldErrors: Record<string, string> };

function parseId(raw: string | undefined): number | null {
  const s = (raw ?? "").trim();
  if (!/^[0-9]{1,15}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export function validateReview(input: RawInput): ReviewResult {
  const errors: Record<string, string> = {};
  const sessionId = parseId(input.sessionId);
  if (sessionId === null) errors.sessionId = "That session could not be found.";
  const reviewedId = parseId(input.reviewedId);
  if (reviewedId === null) errors.reviewedId = "That player could not be found.";
  const ratingRaw = (input.rating ?? "").trim();
  const rating = /^[1-5]$/.test(ratingRaw) ? Number(ratingRaw) : null;
  if (rating === null) errors.rating = "Pick 1 to 5 stars.";
  const comment = (input.comment ?? "").trim();
  if (comment.length > CHAT_LIMITS.reviewCommentMax) {
    errors.comment = `Keep the comment to ${CHAT_LIMITS.reviewCommentMax} characters or fewer.`;
  }
  if (Object.keys(errors).length > 0 || sessionId === null || reviewedId === null || rating === null) {
    return { ok: false, fieldErrors: errors };
  }
  return { ok: true, value: { sessionId, reviewedId, rating, comment: comment === "" ? null : comment } };
}
