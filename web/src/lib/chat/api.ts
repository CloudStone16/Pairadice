import "server-only";
import { getViewer } from "@/lib/auth/viewer";
import { isRefusal } from "@/lib/queries-chat";
import { parseAfter, parseId } from "@/lib/chat/validate";

const KNOWN_REFUSALS: ReadonlySet<string> = new Set(["You are not in this camp.", "Your account cannot do that right now."]);

const HEADERS = { "Cache-Control": "no-store" } as const;

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: HEADERS });
}

/** Shared GET flow for both polling routes: auth, id and `after` validation, fetch, refusal mapping. */
export async function handlePoll<T>(
  request: Request,
  rawId: string,
  load: (viewer: NonNullable<Awaited<ReturnType<typeof getViewer>>>, id: number, after: number | null) => Promise<T[]>,
): Promise<Response> {
  const viewer = await getViewer();
  if (!viewer) return json({ error: "Sign in first." }, 401);
  const id = parseId(rawId);
  if (id === null) return json({ error: "That id is not valid." }, 400);
  const after = parseAfter(new URL(request.url).searchParams.get("after"));
  if (!after.ok) return json({ error: after.error }, 400);
  try {
    return json({ lines: await load(viewer, id, after.value) });
  } catch (err) {
    if (isRefusal(err)) {
      const known = KNOWN_REFUSALS.has(err.sqlMessage);
      return json({ error: known ? err.sqlMessage : "You cannot read this conversation." }, 403);
    }
    console.error("[pairadice] chat poll failed");
    return json({ error: "Could not load messages." }, 500);
  }
}
