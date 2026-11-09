"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { queryAs, transactionAs } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import {
  clearFailures,
  countAttempt,
  isBlocked,
  recordFailure,
  signInAttemptLimits,
  signInFailureLimit,
  signUpLimits,
} from "@/lib/auth/rate-limit";
import { safeNext } from "@/lib/auth/safe-next";
import { SESSION_COOKIE, clearSessionCookie, revokeSession, startSession } from "@/lib/auth/session";
import { GENERIC_ERROR, describeError, mapSignUpError } from "@/lib/auth/signup-errors";
import type { AuthField, AuthFormState } from "@/lib/auth/form-state";

const GENERIC_SIGN_IN = "That email and password do not match.";
const TOO_MANY = "Too many attempts, try again in a few minutes.";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const USERNAME_RE = /^[A-Za-z0-9_]{3,32}$/;

function text(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

/**
 * The caller's address for rate limiting. Behind a proxy the RIGHT-most X-Forwarded-For entry is the one
 * the proxy added (everything left of it is client-supplied and spoofable). Without the header all
 * callers share the "local" bucket. Bounded and charset-limited so it is safe as a key.
 */
async function clientIp(): Promise<string> {
  const h = await headers();
  const parts = h.get("x-forwarded-for")?.split(",") ?? [];
  const last = parts[parts.length - 1]?.trim() ?? "";
  return /^[0-9a-fA-F:.]{2,45}$/.test(last) ? last.toLowerCase() : "local";
}

function validTimezone(tz: string): string {
  try {
    if (tz.length === 0 || tz.length > 64) return "UTC";
    new Intl.DateTimeFormat("en", { timeZone: tz }); // throws RangeError for an unknown zone
    return tz;
  } catch {
    return "UTC";
  }
}

// A real argon2id hash of a random value, so a missing account costs the same as a wrong password.
// Computed at module load so the first sign-in for an unknown email is not measurably faster.
const dummyHash: Promise<string> = hashPassword(crypto.randomUUID());
dummyHash.catch(() => undefined); // surfaced where it is awaited; avoids an unhandled rejection here

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = text(formData, "email").trim().toLowerCase();
  const password = text(formData, "password");
  const next = safeNext(text(formData, "next"));
  const values = { email };
  const fail = (message: string): AuthFormState => ({ status: "error", message, values });

  const ip = await clientIp();
  // the email part of the keys is bounded so a huge value cannot bloat the limiter
  const limitEmail = email.slice(0, 254);
  const failures = signInFailureLimit(ip, limitEmail);
  if (isBlocked(failures) || !countAttempt(signInAttemptLimits(ip, limitEmail)).ok) return fail(TOO_MANY);

  if (!email || !password || email.length > 254 || password.length > 1024) {
    recordFailure(failures);
    return fail(GENERIC_SIGN_IN);
  }

  let userId: number | null = null;
  try {
    const rows = await queryAs<{ user_id: number | string; password_hash: string; status: string }>(
      "auth",
      `SELECT a.user_id, a.password_hash, u.status
         FROM auth_account a JOIN users u ON u.user_id = a.user_id
        WHERE a.provider = 'email' AND a.email = ?`,
      [email],
    );
    const row = rows[0];
    // verify even when the account is missing so timing does not reveal it
    const ok = await verifyPassword(row?.password_hash ?? (await dummyHash), password);
    if (row && ok && row.status !== "banned") userId = Number(row.user_id);
  } catch (err) {
    console.error("[auth] sign-in lookup failed:", describeError(err));
    return fail(GENERIC_ERROR);
  }
  if (userId === null) {
    recordFailure(failures);
    return fail(GENERIC_SIGN_IN);
  }

  try {
    await startSession(userId, (await headers()).get("user-agent"));
  } catch (err) {
    console.error("[auth] could not start a session:", describeError(err));
    return fail(GENERIC_ERROR);
  }
  clearFailures(failures);
  redirect(next); // outside the try: redirect() works by throwing
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const username = text(formData, "username").trim();
  const displayName = text(formData, "displayName").trim();
  const email = text(formData, "email").trim().toLowerCase();
  const password = text(formData, "password");
  const timezone = validTimezone(text(formData, "timezone").trim());
  const next = safeNext(text(formData, "next"));
  const values = { email, username, displayName };

  // counted before any hashing: sign-up is the expensive path
  if (!countAttempt(signUpLimits(await clientIp())).ok) return { status: "error", message: TOO_MANY, values };

  const fieldErrors: Partial<Record<AuthField, string>> = {};
  if (!USERNAME_RE.test(username)) fieldErrors.username = "Use 3-32 letters, digits or underscores.";
  if (displayName.length < 1 || displayName.length > 64) fieldErrors.displayName = "Enter a display name up to 64 characters.";
  if (email.length > 254 || !EMAIL_RE.test(email)) fieldErrors.email = "Enter a valid email address.";
  if (password.length < 10 || password.length > 128) fieldErrors.password = "Use 10 to 128 characters.";
  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors, values };
  }

  let userId: number;
  try {
    const hash = await hashPassword(password);
    userId = await transactionAs("auth", async (conn) => {
      await conn.query("CALL sp_register_user(?, ?, ?, ?, ?, @pd_uid)", [
        username,
        displayName,
        timezone,
        email,
        hash,
      ]);
      const [rows] = await conn.query<Array<{ id: number | string | null } & import("mysql2").RowDataPacket>>(
        "SELECT @pd_uid AS id",
      );
      const id = Number(rows[0]?.id);
      if (!Number.isSafeInteger(id) || id <= 0) throw new Error("sp_register_user returned no id");
      return id;
    });
  } catch (err) {
    const mapped = mapSignUpError(err);
    if (mapped.message === GENERIC_ERROR) console.error("[auth] sign-up failed:", describeError(err));
    return { status: "error", message: mapped.message, fieldErrors: mapped.fieldErrors, values };
  }

  try {
    await startSession(userId, (await headers()).get("user-agent"));
  } catch (err) {
    console.error("[auth] could not start a session after sign-up:", describeError(err));
    return { status: "error", message: GENERIC_ERROR, values };
  }
  redirect(next);
}

export async function signOut(): Promise<void> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (raw) {
    try {
      await revokeSession(raw);
    } catch (err) {
      console.error("[auth] sign-out revoke failed:", describeError(err));
    }
  }
  await clearSessionCookie();
  redirect("/sign-in");
}
