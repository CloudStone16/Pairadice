"use server";

// Review action. Field names: src/lib/chat/types.ts (writeReview). Plain form post works without JS.
import { revalidatePath } from "next/cache";
import { requireViewer } from "@/lib/auth/guards";
import { writeReview as write } from "@/lib/mutations/review";
import { validateReview } from "@/lib/review/validate";
import type { ChatFormState } from "@/lib/chat/types";

const ALLOWED = ["sessionId", "reviewedId", "rating", "comment"];
const MAX_VALUE = 4096;

export async function writeReview(_prev: ChatFormState, formData: FormData): Promise<ChatFormState> {
  const viewer = await requireViewer();
  const raw: Record<string, string> = {};
  for (const key of formData.keys()) {
    if (key.startsWith("$ACTION")) continue;
    if (!ALLOWED.includes(key)) return { status: "error", message: "That request was not understood." };
    const v = formData.get(key);
    if (typeof v !== "string" || v.length > MAX_VALUE) return { status: "error", message: "That request was not understood." };
    raw[key] = v;
  }
  const checked = validateReview(raw);
  if (!checked.ok) {
    return { status: "error", message: "Some details need another look.", fieldErrors: checked.fieldErrors, values: raw };
  }
  if (checked.value.reviewedId === viewer.userId) {
    return { status: "error", message: "You cannot review yourself.", values: raw };
  }
  const res = await write(viewer, checked.value);
  if (!res.ok) return { status: "error", message: res.message, values: raw };
  revalidatePath(`/camp/${checked.value.sessionId}`);
  revalidatePath("/character");
  return { status: "sent", message: "Thanks for the review." };
}
