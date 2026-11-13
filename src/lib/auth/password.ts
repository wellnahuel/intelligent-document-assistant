import { hash, verify } from "@node-rs/argon2";
import type { Algorithm } from "@node-rs/argon2";

/**
 * OWASP Password Storage Cheat Sheet starting point for Argon2id:
 * 19 MiB of memory, 2 iterations, 1 lane, 32-byte tag.
 * https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
 *
 * The parameters are encoded inside the returned hash, so verification keeps
 * working if the defaults change in a future sprint.
 */
export const ARGON2ID_PARAMETERS = {
  // Algorithm.Argon2id is a `const enum`; isolatedModules forbids reading it.
  algorithm: 2 as Algorithm,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
} as const;

/**
 * A valid Argon2id hash for a password nobody uses. It equalizes the cost of
 * a login attempt for an unknown email and a known email with a wrong
 * password, reducing the timing signal that could reveal registration.
 */
export const DUMMY_ARGON2ID_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$D5R2Sjiz1qGaAKMOtxSGsQ$DEFw9kBTKRSRaHfs66y3M/ko40oCeHgBHP822JzfLCQ";

export async function hashPassword(password: string): Promise<string> {
  if (password.length === 0) {
    throw new Error("Cannot hash an empty password.");
  }

  return hash(password, ARGON2ID_PARAMETERS);
}

/**
 * Returns false for malformed or legacy hashes instead of throwing, so a
 * database value can never turn into a login bypass or an internals leak.
 */
export async function verifyPassword(
  passwordHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}
