import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// The Prisma CLI (migrate, studio, introspection) prefers DIRECT_URL when the
// provider exposes a direct connection for migrations. The application runtime
// keeps using DATABASE_URL (possibly a pooled endpoint) in src/lib/db.ts.
const cliDatabaseUrl = process.env.DIRECT_URL?.trim() || env("DATABASE_URL");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: cliDatabaseUrl,
  },
});
