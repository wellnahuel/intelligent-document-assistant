import "server-only";

import { createUser } from "@/lib/auth/users";
import {
  REGISTRATION_WINDOW_SECONDS,
  getUsageLimits,
} from "@/lib/rate-limit/config";
import { authKey } from "@/lib/rate-limit/keys";
import { assertRateLimit } from "@/lib/rate-limit/limiter";

export async function registerUser(input: {
  email: string;
  password: string;
  ip: string;
}): Promise<{ id: string; email: string }> {
  const limits = getUsageLimits();

  await assertRateLimit({
    key: authKey("register-email", input.email),
    limit: limits.registrationsEmailPerHour,
    windowSeconds: REGISTRATION_WINDOW_SECONDS,
  });
  await assertRateLimit({
    key: authKey("register-ip", input.ip),
    limit: limits.registrationsIpPerHour,
    windowSeconds: REGISTRATION_WINDOW_SECONDS,
  });

  return createUser({ email: input.email, password: input.password });
}
