import "server-only";
import { hash, verify } from "@node-rs/argon2";

// argon2id, OWASP minimum profile: 19 MiB, 2 passes, 1 lane.
// algorithm 2 = Argon2id (the enum is a const enum, not importable under isolatedModules).
const OPTIONS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

/** True only when the password matches. Never throws: a malformed hash is just "no". */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}
