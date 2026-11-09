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

function id(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,12}$/.test(v) ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

export async function updatePlayerAction(userId: number, bio: string, tagIds: number[]): Promise<LabResult> {
  const viewer = await requireRole("admin", PATH);
  const uid = id(userId);
  const tags = Array.isArray(tagIds) ? tagIds.map(id) : [];
  if (uid === null || typeof bio !== "string" || tags.some((t) => t === null)) return { ok: false, message: "Bad request." };
  const res = await savePlayerProfile(viewer, uid, bio, tags as number[]);
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
