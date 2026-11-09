"use server";

// Player-side report action. Field names: src/lib/moderation/types.ts (reportUser). Works as a plain
// form post; on success it redirects (outside any try/catch) to the safe `back` path with ?reported=1.
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth/guards";
import { reportUser as file } from "@/lib/mutations/report";
import { validateReport, withReportedFlag } from "@/lib/report/validate";
import type { ModFormState } from "@/lib/moderation/types";

const ALLOWED = ["reportedId", "category", "description", "session", "message", "back"];
const MAX_VALUE = 4096;

export async function reportUser(_prev: ModFormState, formData: FormData): Promise<ModFormState> {
  const viewer = await requireViewer();
  const raw: Record<string, string> = {};
  for (const key of formData.keys()) {
    if (key.startsWith("$ACTION")) continue;
    if (!ALLOWED.includes(key)) return { status: "error", message: "That request was not understood." };
    const v = formData.get(key);
    if (typeof v !== "string" || v.length > MAX_VALUE) return { status: "error", message: "That request was not understood." };
    raw[key] = v;
  }
  const checked = validateReport(raw);
  if (!checked.ok) {
    return { status: "error", message: "Some details need another look.", fieldErrors: checked.fieldErrors, values: raw };
  }
  if (checked.value.reportedId === viewer.userId) {
    return { status: "error", message: "You cannot report yourself.", values: raw };
  }
  const res = await file(viewer, checked.value);
  if (!res.ok) return { status: "error", message: res.message, values: raw };
  revalidatePath("/character");
  redirect(withReportedFlag(checked.value.back));
}
