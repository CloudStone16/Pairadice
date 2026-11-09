"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { AuthField, AuthFormState } from "@/lib/auth/form-state";
import { AUTH_NEXT_FIELD } from "@/lib/auth/form-state";
import { authenticateEmail, createEmailAccount } from "@/lib/auth/accounts";
import { validatePasswordPolicy } from "@/lib/auth/password";
import { checkAll, resetRateLimit, signInLimits, signUpLimits } from "@/lib/auth/rate-limit";
import { createSession, revokeSession } from "@/lib/auth/session";
import {
  normaliseEmail,
  safeNextPath,
  validateDisplayName,
  validateEmail,
  validateUsername,
} from "@/lib/auth/validate";

const GENERIC_ERROR = { status: "error", message: "Something went wrong. Please try again." } as const;

/** Error text for logs: MySQL duplicate-key messages embed the offending value (an email), so redact it. */
function safeErrorText(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.replace(/Duplicate entry '[^']*'/gi, "Duplicate entry '<redacted>'");
}

function field(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v : "";
}

async function clientIp(): Promise<string> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return fwd || h.get("x-real-ip")?.trim() || "local";
}

function tooMany(retryAfterMs: number): AuthFormState {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
  return {
    status: "error",
    message: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
  };
}

export async function signInAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = normaliseEmail(field(formData, "email"));
  const password = field(formData, "password");
  const next = safeNextPath(field(formData, AUTH_NEXT_FIELD));

  const fieldErrors: Partial<Record<AuthField, string>> = {};
  if (email === "") fieldErrors.email = "Email is required.";
  if (password === "") fieldErrors.password = "Password is required.";
  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", message: "Enter your email and password.", fieldErrors, values: { email } };
  }

  const ip = await clientIp();
  const limited = checkAll(signInLimits(ip, email));
  if (!limited.ok) return tooMany(limited.retryAfterMs);

  let result: Awaited<ReturnType<typeof authenticateEmail>>;
  try {
    result = await authenticateEmail(email, password);
    if (result.ok) {
      await createSession(result.userId, (await headers()).get("user-agent"));
      resetRateLimit(`signin:email-ip:${email}|${ip}`);
    }
  } catch (err) {
    console.error("[auth] sign-in failed unexpectedly:", safeErrorText(err));
    return GENERIC_ERROR;
  }

  if (!result.ok) {
    return {
      status: "error",
      message: result.banned ? "This account has been banned." : "Email or password is incorrect.",
      values: { email },
    };
  }
  redirect(next);
}

export async function signUpAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = normaliseEmail(field(formData, "email"));
  const username = field(formData, "username").trim();
  const displayName = field(formData, "displayName").trim();
  const password = field(formData, "password");
  const confirm = field(formData, "confirm");
  const next = safeNextPath(field(formData, AUTH_NEXT_FIELD));
  const values = { email, username, displayName };

  const ip = await clientIp();
  const limited = checkAll(signUpLimits(ip));
  if (!limited.ok) return tooMany(limited.retryAfterMs);

  const fieldErrors: Partial<Record<AuthField, string>> = {};
  const emailErr = validateEmail(email);
  if (emailErr) fieldErrors.email = emailErr;
  const userErr = validateUsername(username);
  if (userErr) fieldErrors.username = userErr;
  const nameErr = validateDisplayName(displayName);
  if (nameErr) fieldErrors.displayName = nameErr;
  const pwErr = validatePasswordPolicy(password);
  if (pwErr) fieldErrors.password = pwErr;
  else if (confirm !== password) fieldErrors.confirm = "Passwords do not match.";
  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors, values };
  }

  let userId: number;
  try {
    const created = await createEmailAccount({ email, username, displayName, password });
    if (!created.ok) {
      if (created.kind === "username_taken") {
        return {
          status: "error",
          message: "Please fix the highlighted fields.",
          fieldErrors: { username: "That username is taken." },
          values,
        };
      }
      if (created.kind === "email_taken") {
        return {
          status: "error",
          message: "We couldn't create that account. If you already have one, sign in instead.",
          values,
        };
      }
      if (created.kind === "business") return { status: "error", message: created.message, values };
      return { status: "error", message: GENERIC_ERROR.message, values };
    }
    userId = created.userId;
    await createSession(userId, (await headers()).get("user-agent"));
  } catch (err) {
    console.error("[auth] sign-up failed unexpectedly:", safeErrorText(err));
    return { ...GENERIC_ERROR, values };
  }
  redirect(next);
}

/** Revokes the current session and redirects to /signin. Used as a plain <form action>. */
export async function signOutAction(): Promise<void> {
  await revokeSession();
  redirect("/signin");
}
