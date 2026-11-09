import { NextResponse, type NextRequest } from "next/server";
import { getViewer, hasRole } from "@/lib/auth/guards";
import { takeSnapshot } from "@/lib/vector-lab";

// Polled every 2 s by the Vector Lab while it waits for the worker. Read-only; admins only (404 for others).
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const viewer = await getViewer();
  if (!viewer || !hasRole(viewer, "admin")) return new NextResponse(null, { status: 404 });
  const raw = request.nextUrl.searchParams.get("user") ?? "";
  const userId = /^\d{1,12}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(userId) || userId < 1) return NextResponse.json({ error: "bad user" }, { status: 400 });
  return NextResponse.json(await takeSnapshot(userId), { headers: { "Cache-Control": "no-store" } });
}
