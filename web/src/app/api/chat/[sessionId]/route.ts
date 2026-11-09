import { handlePoll } from "@/lib/chat/api";
import { fetchChatLines } from "@/lib/queries-chat";

export async function GET(request: Request, ctx: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await ctx.params;
  return handlePoll(request, sessionId, (viewer, id, after) => fetchChatLines(viewer, id, after));
}
