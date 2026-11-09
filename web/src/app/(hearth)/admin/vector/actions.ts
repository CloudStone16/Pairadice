"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import {
  banPlayer,
  createDemoPlayer,
  restorePlayer,
  retryDeadRows,
  savePlayerProfile,
} from "@/lib/vector-lab";
import type { LabResult } from "@/components/lab/types";

// Every action re-checks the admin role: a server action is a public POST endpoint.
const PATH = "/admin/vector";

const BIO_MAX = 500;
const TAGS_MAX = 20;

function id(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,12}$/.test(v) ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function updatePlayerAction(userId: number, bio: string, tagIds: number[]): Promise<LabResult> {
  const viewer = await requireRole("admin", PATH);
  const uid = id(userId);
  if (uid === null || typeof bio !== "string" || !Array.isArray(tagIds)) return { ok: false, message: "Bad request." };
  if (bio.length > BIO_MAX) return { ok: false, message: `Keep the bio to ${BIO_MAX} characters.` };
  if (tagIds.length > TAGS_MAX) return { ok: false, message: `Pick at most ${TAGS_MAX} tags.` };
  const tags: number[] = [];
  for (const raw of tagIds) {
    const t = id(raw);
    if (t === null) return { ok: false, message: "Bad request." };
    if (!tags.includes(t)) tags.push(t);
  }
  const res = await savePlayerProfile(viewer, uid, bio, tags);
  revalidatePath(PATH);
  return res;
}

export async function banPlayerAction(userId: number): Promise<LabResult> {
  const viewer = await requireRole("admin", PATH);
  const uid = id(userId);
  if (uid === null) return { ok: false, message: "Bad request." };
  const res = await banPlayer(viewer, uid);
  revalidatePath(PATH);
  return res;
}

export async function restorePlayerAction(userId: number): Promise<LabResult> {
  const viewer = await requireRole("admin", PATH);
  const uid = id(userId);
  if (uid === null) return { ok: false, message: "Bad request." };
  const res = await restorePlayer(viewer, uid);
  revalidatePath(PATH);
  return res;
}

export async function createDemoPlayerAction(): Promise<LabResult> {
  const viewer = await requireRole("admin", PATH);
  const res = await createDemoPlayer(viewer);
  revalidatePath(PATH);
  return res;
}

/** Plain form action: put dead-letter rows back in the queue. */
export async function retryDeadAction(): Promise<void> {
  const viewer = await requireRole("admin", PATH);
  await retryDeadRows(viewer);
  revalidatePath(PATH);
}
