"use server";

import { revalidatePath } from "next/cache";
import { getViewer, type Viewer } from "@/lib/auth/viewer";
import {
  acceptPlayer,
  declinePlayer,
  kickPlayer,
  requestJoin,
  setSessionStatus,
  withdrawOrLeave,
  type NextSessionStatus,
} from "@/lib/mutations/participants";
import type { ActionResult } from "@/lib/mutations/run";
import { markRecommendationOutcome } from "@/lib/recommend";

/** What a camp form shows after submitting: the database's message on failure, a short note on success. */
export type CampActionState = { ok: boolean; message: string } | null;

function intField(fd: FormData, name: string): number | null {
  const raw = fd.get(name);
  if (typeof raw !== "string" || !/^\d{1,15}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

const STATUSES: readonly NextSessionStatus[] = ["in_progress", "cancelled", "completed"];

function refresh(sessionId: number): void {
  revalidatePath(`/camp/${sessionId}`);
  revalidatePath("/party");
  revalidatePath("/board");
}

function finish(sessionId: number, r: ActionResult<unknown>, done: string): CampActionState {
  if (!r.ok) return { ok: false, message: r.message };
  refresh(sessionId);
  return { ok: true, message: done };
}

const SIGN_IN: CampActionState = { ok: false, message: "Sign in first." };

const bad = (what: string): CampActionState => ({ ok: false, message: `Missing or invalid ${what}.` });

export async function requestJoinAction(_prev: CampActionState, fd: FormData): Promise<CampActionState> {
  const sessionId = intField(fd, "sessionId");
  const roleId = intField(fd, "roleId");
  if (sessionId === null) return bad("session");
  if (roleId === null) return { ok: false, message: "Pick the role you want to play." };
  const rawAccount = fd.get("accountId");
  const accountId = rawAccount === null || rawAccount === "" ? null : intField(fd, "accountId");
  if (rawAccount !== null && rawAccount !== "" && accountId === null) return bad("platform account");
  const viewer = await getViewer();
  if (!viewer) return SIGN_IN;
  const r = await requestJoin(viewer, sessionId, roleId, accountId);
  if (r.ok) {
    await markRecommendationOutcome(viewer, sessionId, "requested");
    if (r.value === "accepted") await markRecommendationOutcome(viewer, sessionId, "joined");
  }
  return finish(sessionId, r, r.ok && r.value === "accepted" ? "You joined the party." : "Knock sent. The host will answer soon.");
}

export async function withdrawOrLeaveAction(_prev: CampActionState, fd: FormData): Promise<CampActionState> {
  const sessionId = intField(fd, "sessionId");
  if (sessionId === null) return bad("session");
  const viewer = await getViewer();
  if (!viewer) return SIGN_IN;
  return finish(sessionId, await withdrawOrLeave(viewer, sessionId), "Done.");
}

async function targetAction(
  fd: FormData,
  run: (viewer: Viewer, sessionId: number, userId: number) => Promise<ActionResult>,
  done: string,
): Promise<CampActionState> {
  const viewer = await getViewer();
  if (!viewer) return SIGN_IN;
  const sessionId = intField(fd, "sessionId");
  const userId = intField(fd, "userId");
  if (sessionId === null || userId === null) return bad("player");
  return finish(sessionId, await run(viewer, sessionId, userId), done);
}

export async function acceptPlayerAction(_prev: CampActionState, fd: FormData): Promise<CampActionState> {
  // markRecommendationOutcome(viewer, ...) only updates the viewer's own rows, so the accepted
  // player's recommendation is not marked "joined" here.
  return targetAction(fd, acceptPlayer, "Player accepted.");
}

export async function declinePlayerAction(_prev: CampActionState, fd: FormData): Promise<CampActionState> {
  return targetAction(fd, declinePlayer, "Request declined.");
}

export async function kickPlayerAction(_prev: CampActionState, fd: FormData): Promise<CampActionState> {
  return targetAction(fd, kickPlayer, "Player removed.");
}

export async function setSessionStatusAction(_prev: CampActionState, fd: FormData): Promise<CampActionState> {
  const sessionId = intField(fd, "sessionId");
  const status = fd.get("status");
  if (sessionId === null) return bad("session");
  if (typeof status !== "string" || !STATUSES.includes(status as NextSessionStatus)) return bad("status");
  const viewer = await getViewer();
  if (!viewer) return SIGN_IN;
  return finish(sessionId, await setSessionStatus(viewer, sessionId, status as NextSessionStatus), "Quest updated.");
}
