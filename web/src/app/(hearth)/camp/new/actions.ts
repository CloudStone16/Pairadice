"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth/viewer";
import { createQuest } from "@/lib/mutations/sessions";
import { getHostAccounts, getQuestCatalog } from "@/lib/queries-quest";
import { getUserById } from "@/lib/queries";
import { safeTimeZone } from "@/lib/format";
import { validateQuest } from "@/components/quest/validate";
import type { QuestFormState, QuestValues } from "@/components/quest/types";

function collect(formData: FormData): QuestValues {
  const out: QuestValues = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const all = formData.getAll(key).filter((v): v is string => typeof v === "string");
    out[key] = key === "languages" || key === "tags" ? all : (all[0] ?? "");
  }
  return out;
}

export async function hostQuest(_prev: QuestFormState, formData: FormData): Promise<QuestFormState> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=%2Fcamp%2Fnew");
  const values = collect(formData);
  if (viewer.status !== "active") {
    return { status: "error", message: "Your account is suspended, so you cannot host quests.", values };
  }

  const [catalog, accounts, user] = await Promise.all([
    getQuestCatalog(viewer),
    getHostAccounts(viewer),
    getUserById(viewer.userId),
  ]);
  const result = validateQuest(values, catalog, accounts, new Date(), safeTimeZone(user?.timezone));
  if (!result.ok) {
    return {
      status: "error",
      message: "Some details need another look.",
      fieldErrors: result.errors,
      values,
    };
  }

  const created = await createQuest(viewer, result.input);
  if (!created.ok) return { status: "error", message: created.message, values };

  revalidatePath("/board", "layout");
  redirect(`/camp/${created.value}`);
}
