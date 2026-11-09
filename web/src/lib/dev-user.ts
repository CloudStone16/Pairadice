import "server-only";
import { cookies } from "next/headers";

/**
 * DEV-ONLY "play as" identity until real sign-in arrives in Phase 2.
 * It is honoured only when NODE_ENV === "development" AND PAIRADICE_DEV_AUTH === "1".
 * Anywhere else there is no identity at all and the app shows the sign-in gate.
 */
export const DEV_USER_COOKIE = "pd_dev_user";
export const DEFAULT_DEV_USER_ID = 1;

export function isDevAuthEnabled(): boolean {
  return process.env.NODE_ENV === "development" && process.env.PAIRADICE_DEV_AUTH === "1";
}

/** Cookie value meaning "play as nobody" so the signed-out UI can be tested in dev. */
export const DEV_SIGNED_OUT = "none";

export function isDevSignedOut(raw: string | null | undefined): boolean {
  return raw?.trim() === DEV_SIGNED_OUT;
}

/** A numeric dev user id, or null for "none" and anything malformed. */
export function parseDevUserId(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (!/^\d{1,4}$/.test(trimmed)) return null;
  const id = Number(trimmed);
  return id >= 1 && id <= 9999 ? id : null;
}

/** The dev "play as" id, or null when signed out (dev auth disabled, or the cookie is "none"). */
export async function getDevUserId(): Promise<number | null> {
  if (!isDevAuthEnabled()) return null;
  const jar = await cookies();
  const raw = jar.get(DEV_USER_COOKIE)?.value;
  if (isDevSignedOut(raw)) return null;
  return parseDevUserId(raw) ?? DEFAULT_DEV_USER_ID;
}
