"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { DEV_SIGNED_OUT, DEV_USER_COOKIE, isDevAuthEnabled, isDevSignedOut, parseDevUserId } from "@/lib/dev-user";
import { getUserById } from "@/lib/queries";

/** DEV-ONLY: choose which user to "play as". A no-op unless dev auth is enabled. */
export async function setDevUser(formData: FormData): Promise<void> {
  if (!isDevAuthEnabled()) return;
  const raw = formData.get("userId");
  const value = typeof raw === "string" ? raw : null;
  let stored: string;
  if (isDevSignedOut(value)) {
    stored = DEV_SIGNED_OUT;
  } else {
    const id = parseDevUserId(value);
    if (id === null) return;
    if (!(await getUserById(id))) return;
    stored = String(id);
  }
  const jar = await cookies();
  jar.set(DEV_USER_COOKIE, stored, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  revalidatePath("/", "layout");
}
