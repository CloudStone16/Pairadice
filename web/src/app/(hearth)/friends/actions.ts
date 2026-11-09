"use server";

import { revalidatePath } from "next/cache";
import { getViewer, type Viewer } from "@/lib/auth/viewer";
import type { ActionResult } from "@/lib/mutations/run";
import {
  blockUser,
  cancelFriendRequest,
  removeFriend,
  respondFriendRequest,
  sendFriendRequest,
  unblockUser,
} from "@/lib/mutations/social";

/** What a friends control shows after submitting: the database's message on failure, a short note on success. */
export type SocialActionState = { ok: boolean; message: string } | null;

function intField(fd: FormData, name: string): number | null {
  const raw = fd.get(name);
  if (typeof raw !== "string" || !/^\d{1,15}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

async function run(
  fd: FormData,
  call: (viewer: Viewer, otherId: number) => Promise<ActionResult>,
  done: string,
): Promise<SocialActionState> {
  const otherId = intField(fd, "userId");
  if (otherId === null) return { ok: false, message: "Missing or invalid player." };
  const viewer = await getViewer();
  if (!viewer) return { ok: false, message: "Sign in first." };
  const r = await call(viewer, otherId);
  if (!r.ok) return { ok: false, message: r.message };
  revalidatePath("/friends");
  revalidatePath(`/character/${otherId}`);
  revalidatePath("/hearth");
  return { ok: true, message: done };
}

export async function sendRequestAction(_p: SocialActionState, fd: FormData): Promise<SocialActionState> {
  return run(fd, sendFriendRequest, "Friend request sent.");
}

export async function acceptAction(_p: SocialActionState, fd: FormData): Promise<SocialActionState> {
  return run(fd, (v, id) => respondFriendRequest(v, id, true), "Request accepted. You are friends now.");
}

export async function declineAction(_p: SocialActionState, fd: FormData): Promise<SocialActionState> {
  return run(fd, (v, id) => respondFriendRequest(v, id, false), "Request declined.");
}

export async function cancelRequestAction(_p: SocialActionState, fd: FormData): Promise<SocialActionState> {
  return run(fd, cancelFriendRequest, "Request cancelled.");
}

export async function removeFriendAction(_p: SocialActionState, fd: FormData): Promise<SocialActionState> {
  return run(fd, removeFriend, "Friend removed.");
}

export async function blockAction(_p: SocialActionState, fd: FormData): Promise<SocialActionState> {
  return run(fd, blockUser, "Player blocked.");
}

export async function unblockAction(_p: SocialActionState, fd: FormData): Promise<SocialActionState> {
  return run(fd, unblockUser, "Player unblocked.");
}
