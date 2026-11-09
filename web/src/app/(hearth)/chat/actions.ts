"use server";

// Chat and DM actions. Field names: src/lib/chat/types.ts. They work as plain form posts; the composer keeps
// the text on failure through `values`. deleteOwnMessage redirects (outside any try/catch) to the safe `back`.
import { redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth/guards";
import { deleteOwnMessage as removeOwn, sendDm as sendDmLine, sendSessionMessage as sendCampLine } from "@/lib/mutations/chat";
import { parseId, safeBack, validateMessage } from "@/lib/chat/validate";
import type { ChatFormState } from "@/lib/chat/types";

const MAX_VALUE = 8192;
const BAD: ChatFormState = { status: "error", message: "That request was not understood." };

function readFields(formData: FormData, allowed: string[]): Record<string, string> | null {
  const raw: Record<string, string> = {};
  for (const key of formData.keys()) {
    if (key.startsWith("$ACTION")) continue;
    if (!allowed.includes(key)) return null;
    const v = formData.get(key);
    if (typeof v !== "string" || v.length > MAX_VALUE) return null;
    raw[key] = v;
  }
  return raw;
}

async function send(
  formData: FormData,
  idField: "sessionId" | "receiverId",
  run: (viewerFn: Awaited<ReturnType<typeof requireViewer>>, id: number, text: string) => Promise<{ ok: true } | { ok: false; message: string }>,
): Promise<ChatFormState> {
  const viewer = await requireViewer();
  const raw = readFields(formData, [idField, "content"]);
  if (!raw) return BAD;
  const id = parseId(raw[idField]);
  if (id === null) return { ...BAD, values: raw };
  const checked = validateMessage(raw.content);
  if (!checked.ok) {
    return { status: "error", message: checked.error, fieldErrors: { content: checked.error }, values: raw };
  }
  const res = await run(viewer, id, checked.value);
  if (!res.ok) return { status: "error", message: res.message, values: raw };
  return { status: "sent" };
}

export async function sendSessionMessage(_prev: ChatFormState, formData: FormData): Promise<ChatFormState> {
  return send(formData, "sessionId", (v, id, text) => sendCampLine(v, id, text));
}

export async function sendDm(_prev: ChatFormState, formData: FormData): Promise<ChatFormState> {
  return send(formData, "receiverId", (v, id, text) => sendDmLine(v, id, text));
}

export async function deleteOwnMessage(_prev: ChatFormState, formData: FormData): Promise<ChatFormState> {
  const viewer = await requireViewer();
  const raw = readFields(formData, ["messageId", "back"]);
  if (!raw) return BAD;
  const id = parseId(raw.messageId);
  if (id === null) return BAD;
  const res = await removeOwn(viewer, id);
  if (!res.ok) return { status: "error", message: res.message };
  redirect(safeBack(raw.back, "/hearth"));
}
