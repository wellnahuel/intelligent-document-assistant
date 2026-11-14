import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { getDatabasePoolMax, getDatabaseUrl } from "@/lib/config";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: getDatabaseUrl(),
    // One pool per warm instance, bounded so a serverless deployment does not
    // open a connection per request. The provider pools connections at its own
    // endpoint (for example Neon's pooled URL).
    max: getDatabasePoolMax(),
  });

  return new PrismaClient({ adapter });
}

/**
 * Module-level singleton reused by every request handled by the same process.
 * Caching on globalThis also survives development hot reloads instead of
 * creating a new pool on every module evaluation.
 */
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = prisma;
