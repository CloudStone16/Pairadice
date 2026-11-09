import "server-only";
import { headers } from "next/headers";

/**
 * The caller's address for rate limiting. Behind a proxy the RIGHT-most X-Forwarded-For entry is the one
 * the proxy added (everything left of it is client-supplied and spoofable). Without the header all
 * callers share the "local" bucket. Bounded and charset-limited so it is safe as a key.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const parts = h.get("x-forwarded-for")?.split(",") ?? [];
  const last = parts[parts.length - 1]?.trim() ?? "";
  return /^[0-9a-fA-F:.]{2,45}$/.test(last) ? last.toLowerCase() : "local";
}
