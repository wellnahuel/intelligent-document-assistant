import "server-only";

import { parseLoginCredentials } from "@/lib/auth/input";
import {
  DUMMY_ARGON2ID_HASH,
  verifyPassword,
} from "@/lib/auth/password";
import { findUserByEmail } from "@/lib/auth/users";
import { getClientIp } from "@/lib/client-ip";
import { LOGIN_WINDOW_SECONDS, getUsageLimits } from "@/lib/rate-limit/config";
import { authKey } from "@/lib/rate-limit/keys";
import { consumeRateLimit } from "@/lib/rate-limit/limiter";

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string | null;
};

/**
 * Credential verification used by Auth.js. Both rate-limit buckets are
 * consumed before touching the user table, so brute force and account
 * enumeration pay the same cost whether the email exists or not.
 */
export async function authorizeCredentials(
  raw: Partial<Record<"email" | "password", unknown>> | undefined,
  headers: { get(name: string): string | null },
): Promise<AuthenticatedUser | null> {
  const credentials = parseLoginCredentials(raw);

  if (!credentials) {
    return null;
  }

  const limits = getUsageLimits();
  const ip = getClientIp(headers);
  const [emailBucket, ipBucket] = await Promise.all([
    consumeRateLimit({
      key: authKey("login-email", credentials.email),
      limit: limits.loginEmailPerWindow,
      windowSeconds: LOGIN_WINDOW_SECONDS,
    }),
    consumeRateLimit({
      key: authKey("login-ip", ip),
      limit: limits.loginIpPerWindow,
      windowSeconds: LOGIN_WINDOW_SECONDS,
    }),
  ]);

  if (!emailBucket.allowed || !ipBucket.allowed) {
    return null;
  }

  const user = await findUserByEmail(credentials.email);
  const passwordHash = user?.passwordHash ?? DUMMY_ARGON2ID_HASH;
  const passwordMatches = await verifyPassword(
    passwordHash,
    credentials.password,
  );

  if (!user || !passwordMatches) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
  };
}
