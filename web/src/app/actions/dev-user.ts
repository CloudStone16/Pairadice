"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { DEV_USER_COOKIE, isDevAuthEnabled, parseDevUserId } from "@/lib/dev-user";
import { getUserById } from "@/lib/queries";

/** DEV-ONLY: choose which user to "play as". A no-op unless dev auth is enabled. */
export async function setDevUser(formData: FormData): Promise<void> {
  if (!isDevAuthEnabled()) return;
  const raw = formData.get("userId");
  const id = parseDevUserId(typeof raw === "string" ? raw : null);
  if (id === null) return;
  if (!(await getUserById(id))) return;
  const jar = await cookies();
  jar.set(DEV_USER_COOKIE, String(id), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  revalidatePath("/", "layout");
}
