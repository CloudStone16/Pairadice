"use server";

// Role management server actions (admin only). Field names: src/lib/moderation/types.ts (grantRole, revokeRole).
// Each action re-checks the admin role, allow-lists the form, then makes one procedure call as the viewer.
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/guards";
import { grantRole as grant, revokeRole as revoke } from "@/lib/mutations/admin";
import type { ActionResult } from "@/lib/mutations/run";
import { validateRoleChange } from "@/lib/report/validate";
import type { ModFormState, RoleName } from "@/lib/moderation/types";

const PATH = "/admin/users";
const ALLOWED = ["userId", "role"];

async function handle(
  formData: FormData,
  run: (viewer: Awaited<ReturnType<typeof requireRole>>, userId: number, role: RoleName) => Promise<ActionResult>,
  done: (role: RoleName) => string,
): Promise<ModFormState> {
  const viewer = await requireRole("admin", PATH);
  const raw: Record<string, string> = {};
  for (const key of formData.keys()) {
    if (key.startsWith("$ACTION")) continue;
    if (!ALLOWED.includes(key)) return { status: "error", message: "That request was not understood." };
    const v = formData.get(key);
    if (typeof v !== "string" || v.length > 64) return { status: "error", message: "That request was not understood." };
    raw[key] = v;
  }
  const checked = validateRoleChange(raw);
  if (!checked.ok) return { status: "error", message: "That request was not understood.", fieldErrors: checked.fieldErrors };
  const res = await run(viewer, checked.value.userId, checked.value.role);
  if (!res.ok) return { status: "error", message: res.message };
  revalidatePath(PATH);
  revalidatePath(`${PATH}/${checked.value.userId}`);
  return { status: "saved", message: done(checked.value.role) };
}

export async function grantRole(_prev: ModFormState, formData: FormData): Promise<ModFormState> {
  return handle(formData, grant, (r) => `Granted the ${r} role.`);
}

export async function revokeRole(_prev: ModFormState, formData: FormData): Promise<ModFormState> {
  return handle(formData, revoke, (r) => `Revoked the ${r} role.`);
}
