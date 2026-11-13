import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

const MAX_KEY_LENGTH = 200;

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfterSeconds: number;
};

type BucketRow = {
  count: number;
  windowStartedAt: Date | string;
  expiresAt: Date | string;
};

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer; received ${value}.`);
  }
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Fixed-window limiter backed by PostgreSQL. The INSERT ... ON CONFLICT
 * statement is atomic, so concurrent requests for the same key cannot both
 * observe an old count. Rows survive process restarts and are shared by every
 * replica using the same database; this is not an in-memory limiter.
 *
 * Expired keys are reset on the next request for the same key. The table is
 * bounded by distinct subjects, not by request count; old rows can be removed
 * with: DELETE FROM "RateLimitBucket" WHERE "expiresAt" < now();
 */
export async function consumeRateLimit(input: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  assertPositiveInteger(input.limit, "limit");
  assertPositiveInteger(input.windowSeconds, "windowSeconds");

  if (input.key.length === 0 || input.key.length > MAX_KEY_LENGTH) {
    throw new Error("Rate-limit key has an invalid length.");
  }

  const now = new Date();
  const cutoff = new Date(now.getTime() - input.windowSeconds * 1000);
  const expiresAt = new Date(now.getTime() + input.windowSeconds * 1000);

  const rows = await prisma.$queryRaw<BucketRow[]>(Prisma.sql`
    INSERT INTO "RateLimitBucket" (
      "key",
      "count",
      "windowStartedAt",
      "expiresAt"
    )
    VALUES (${input.key}, 1, ${now}, ${expiresAt})
    ON CONFLICT ("key")
    DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."windowStartedAt" <= ${cutoff} THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "windowStartedAt" = CASE
        WHEN "RateLimitBucket"."windowStartedAt" <= ${cutoff} THEN ${now}
        ELSE "RateLimitBucket"."windowStartedAt"
      END,
      "expiresAt" = CASE
        WHEN "RateLimitBucket"."windowStartedAt" <= ${cutoff} THEN ${expiresAt}
        ELSE "RateLimitBucket"."expiresAt"
      END
    RETURNING "count", "windowStartedAt", "expiresAt"
  `);

  const row = rows[0];

  if (!row) {
    throw new Error("PostgreSQL did not return the rate-limit bucket.");
  }

  const windowStartedAt = toDate(row.windowStartedAt);
  const resetAt = new Date(
    windowStartedAt.getTime() + input.windowSeconds * 1000,
  );
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((resetAt.getTime() - now.getTime()) / 1000),
  );
  const allowed = row.count <= input.limit;

  return {
    allowed,
    count: row.count,
    limit: input.limit,
    remaining: Math.max(0, input.limit - row.count),
    resetAt,
    retryAfterSeconds,
  };
}

export async function assertRateLimit(input: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<void> {
  const result = await consumeRateLimit(input);

  if (!result.allowed) {
    throw new AppError(
      "RATE_LIMITED",
      `Demasiadas solicitudes. Intentá de nuevo en ${result.retryAfterSeconds} segundos.`,
      { retryAfterSeconds: result.retryAfterSeconds },
    );
  }
}
