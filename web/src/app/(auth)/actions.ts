"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { queryAs, transactionAs } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { isLimited, recordFailure, reset } from "@/lib/auth/rate-limit";
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createSession,
  revokeSession,
  setSessionCookie,
} from "@/lib/auth/session";
import type { AuthField, AuthFormState } from "@/lib/auth/form-state";

const GENERIC_SIGN_IN = "That email and password do not match.";
const GENERIC_ERROR = "Something went wrong, please try again.";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const USERNAME_RE = /^[A-Za-z0-9_]{3,32}$/;

function text(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

async function clientIp(): Promise<string> {
  const h = await headers();
  const first = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first ? first : "local";
}

/** Same-site relative paths only. */
function safeNext(raw: string): string {
  if (raw.startsWith("/") && !raw.startsWith("//") && !raw.includes("\\") && !/[\u0000-\u001f]/.test(raw)) {
    return raw;
  }
  return "/hearth";
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

let dummy: Promise<string> | undefined;
// A real argon2id hash of a random value, so a missing account costs the same as a wrong password.
function dummyHash(): Promise<string> {
  return (dummy ??= hashPassword(crypto.randomUUID()));
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = text(formData, "email").trim().toLowerCase();
  const password = text(formData, "password");
  const next = safeNext(text(formData, "next"));
  const values = { email };
  const fail = (message: string): AuthFormState => ({ status: "error", message, values });

  const key = `${email}|${await clientIp()}`;
  if (isLimited(key)) return fail("Too many attempts, try again in a few minutes.");

  if (!email || !password || email.length > 254 || password.length > 1024) {
    recordFailure(key);
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
    const ok = await verifyPassword(row?.password_hash ?? (await dummyHash()), password);
    if (row && ok && row.status !== "banned") userId = Number(row.user_id);
  } catch (err) {
    console.error("[auth] sign-in lookup failed:", err instanceof Error ? err.message : "unknown");
    return fail(GENERIC_ERROR);
  }
  if (userId === null) {
    recordFailure(key);
    return fail(GENERIC_SIGN_IN);
  }

  reset(key);
  const ua = (await headers()).get("user-agent");
  const { token } = await createSession(userId, ua);
  await setSessionCookie(token);
  redirect(next);
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const username = text(formData, "username").trim();
  const displayName = text(formData, "displayName").trim();
  const email = text(formData, "email").trim().toLowerCase();
  const password = text(formData, "password");
  const timezone = validTimezone(text(formData, "timezone").trim());
  const values = { email, username, displayName };

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
    const e = err as { sqlState?: string; sqlMessage?: string };
    if (e.sqlState === "45000" && e.sqlMessage) {
      const m = e.sqlMessage;
      const field: AuthField | undefined = /username/i.test(m)
        ? "username"
        : /email/i.test(m)
          ? "email"
          : /display/i.test(m)
            ? "displayName"
            : undefined;
      return {
        status: "error",
        message: m,
        fieldErrors: field ? { [field]: m } : undefined,
        values,
      };
    }
    console.error("[auth] sign-up failed:", err instanceof Error ? err.message : "unknown");
    return { status: "error", message: GENERIC_ERROR, values };
  }

  const ua = (await headers()).get("user-agent");
  const { token } = await createSession(userId, ua);
  await setSessionCookie(token);
  redirect("/hearth");
}

export async function signOut(): Promise<void> {
  const raw = (await cookies()).get(SESSION_COOKIE)?.value;
  if (raw) {
    try {
      await revokeSession(raw);
    } catch (err) {
      console.error("[auth] sign-out revoke failed:", err instanceof Error ? err.message : "unknown");
    }
  }
  await clearSessionCookie();
  redirect("/sign-in");
}
