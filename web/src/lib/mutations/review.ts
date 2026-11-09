import "server-only";
import { callProcAs, execAs } from "@/lib/db";
import type { Viewer } from "@/lib/auth/viewer";
import { readLoginForRoles } from "@/lib/db-roles";
import type { ReviewInput } from "@/lib/review/validate";
import { runAsViewer, type ActionResult } from "./run";

/** Write a review through sp_write_review (the actor is always the viewer). */
export async function writeReview(viewer: Viewer, input: ReviewInput): Promise<ActionResult> {
  return runAsViewer(viewer, async (login) => {
    await execAs(login, "CALL sp_write_review(?,?,?,?,?)", [
      viewer.userId,
      input.sessionId,
      input.reviewedId,
      input.rating,
      input.comment,
    ]);
  });
}

export interface PendingReview {
  userId: number;
  username: string;
  displayName: string;
}

interface PendingRaw {
  user_id: number | string;
  username: string;
  display_name: string | null;
}

/** Teammates the viewer may still review in a completed session. Empty for anonymous viewers or on any failure. */
export async function getPendingReviews(viewer: Viewer | null, sessionId: number): Promise<PendingReview[]> {
  if (!viewer) return [];
  const login = readLoginForRoles(viewer.roles);
  if (login === "web") return [];
  try {
    const rows = await callProcAs<PendingRaw>(login, "CALL sp_pending_reviews(?,?)", [viewer.userId, sessionId]);
    return rows.map((r) => ({ userId: Number(r.user_id), username: r.username, displayName: r.display_name || r.username }));
  } catch (err) {
    console.error("[pairadice] sp_pending_reviews failed:", err instanceof Error ? err.message : "unknown");
    return [];
  }
}
