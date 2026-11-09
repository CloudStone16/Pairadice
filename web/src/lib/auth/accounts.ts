import "server-only";
import { queryAs, toBusinessError, withTransaction } from "@/lib/db";
import { dummyVerify, hashPassword, verifyPassword } from "@/lib/auth/password";
import { duplicateKind } from "@/lib/auth/duplicate-key";
import type { UserStatus } from "@/lib/auth/session";

export type CreateAccountResult =
  | { ok: true; userId: number }
  | { ok: false; kind: "username_taken" | "email_taken" }
  | { ok: false; kind: "business"; message: string };

export interface NewEmailAccount {
  email: string; // already normalised
  username: string;
  displayName: string;
  password: string;
}

export { duplicateKind } from "@/lib/auth/duplicate-key";

export async function createEmailAccount(input: NewEmailAccount): Promise<CreateAccountResult> {
  const passwordHash = await hashPassword(input.password);
  try {
    const userId = await withTransaction("auth", async (c) => {
      const u = await c.exec(
        "INSERT INTO users (username, display_name, timezone) VALUES (?, ?, 'UTC')",
        [input.username, input.displayName],
      );
      await c.exec(
        `INSERT INTO auth_account (user_id, provider, provider_user_id, email, password_hash, email_verified)
         VALUES (?, 'email', NULL, ?, ?, FALSE)`,
        [u.insertId, input.email, passwordHash],
      );
      // pd_auth cannot write user_role directly; the DEFINER procedure grants only 'player'.
      await c.exec("CALL sp_register_player(?)", [u.insertId]);
      return u.insertId;
    });
    return { ok: true, userId };
  } catch (err) {
    const dup = duplicateKind(err);
    if (dup) return { ok: false, kind: dup };
    const biz = toBusinessError(err);
    if (biz && biz.errno !== 1062) return { ok: false, kind: "business", message: biz.message };
    throw err;
  }
}

export type AuthenticateResult =
  | { ok: true; userId: number; status: UserStatus }
  | { ok: false; banned?: true };

interface AccountRow {
  user_id: number;
  password_hash: string | null;
  status: UserStatus;
}

export async function authenticateEmail(email: string, password: string): Promise<AuthenticateResult> {
  const rows = await queryAs<AccountRow>(
    "auth",
    `SELECT a.user_id, a.password_hash, u.status
       FROM auth_account a JOIN users u ON u.user_id = a.user_id
      WHERE a.provider = 'email' AND a.email = ?`,
    [email],
  );
  const row = rows[0];
  if (!row || !row.password_hash) {
    await dummyVerify(password);
    return { ok: false };
  }
  if (!(await verifyPassword(row.password_hash, password))) return { ok: false };
  if (row.status === "banned") return { ok: false, banned: true };
  return { ok: true, userId: row.user_id, status: row.status };
}
