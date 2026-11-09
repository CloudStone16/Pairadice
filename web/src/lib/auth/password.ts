import { hash, verify } from "@node-rs/argon2";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth/form-state";

export { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH };

// argon2id with the OWASP minimum profile (m=19 MiB, t=2, p=1). Algorithm
// defaults to Argon2id in @node-rs/argon2; the output prefix is asserted below.
const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export async function hashPassword(plain: string): Promise<string> {
  const out = await hash(plain, ARGON2_OPTIONS);
  if (!out.startsWith("$argon2id$")) throw new Error("Unexpected password hash format.");
  return out;
}

/** True only for a matching password. Malformed hashes or odd input yield false, never a throw. */
export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  if (typeof storedHash !== "string" || typeof plain !== "string") return false;
  if (!storedHash.startsWith("$argon2id$")) return false;
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}

/** A user-facing message when the password is unacceptable, otherwise null. */
export function validatePasswordPolicy(plain: string): string | null {
  if (typeof plain !== "string" || plain.trim().length === 0) return "Password cannot be blank.";
  if (plain.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (plain.length > PASSWORD_MAX_LENGTH) return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  return null;
}

let dummyHash: Promise<string> | undefined;

/**
 * Burn about the same time as a real verification, so "unknown email" and
 * "wrong password" are not distinguishable by latency. Always resolves false.
 */
export async function dummyVerify(plain: string): Promise<false> {
  dummyHash ??= hashPassword("pairadice-dummy-password-not-a-real-credential");
  try {
    await verifyPassword(await dummyHash, plain);
  } catch (err) {
    dummyHash = undefined; // a rejected promise must not be cached forever
    throw err;
  }
  return false;
}
