import { handlePoll, json } from "@/lib/chat/api";
import { getViewer } from "@/lib/auth/viewer";
import { fetchDmLines } from "@/lib/queries-chat";

export async function GET(request: Request, ctx: { params: Promise<{ userId: string }> }) {
  const { userId } = await ctx.params;
  const viewer = await getViewer();
  if (viewer && String(viewer.userId) === userId.trim()) return json({ error: "You cannot message yourself." }, 400);
  return handlePoll(request, userId, (v, id, after) => fetchDmLines(v, id, after));
}
