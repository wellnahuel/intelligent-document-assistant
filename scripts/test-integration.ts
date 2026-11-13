import "dotenv/config";

import { execFileSync } from "node:child_process";
import { Client } from "pg";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env first.`);
  }

  return value;
}

function testDatabaseUrl(adminUrl: string): string {
  const explicit = process.env.TEST_DATABASE_URL?.trim();

  if (explicit) {
    return explicit;
  }

  const url = new URL(adminUrl);
  const databaseName = url.pathname.replace(/^\//, "");

  if (!databaseName) {
    throw new Error("DATABASE_URL must include a database name.");
  }

  url.pathname = `/${databaseName}_test`;

  return url.toString();
}

function databaseNameOf(url: string): string {
  const name = new URL(url).pathname.replace(/^\//, "");

  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(
      "The test database name must contain only letters, numbers and underscores.",
    );
  }

  if (!name.endsWith("_test")) {
    throw new Error(
      "Refusing to run integration tests against a database whose name does not end in _test.",
    );
  }

  return name;
}

async function ensureDatabase(adminUrl: string, databaseName: string): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();

  try {
    const existing = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [databaseName],
    );

    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE "${databaseName}"`);
      console.info(`[test:integration] Created database ${databaseName}.`);
    }
  } finally {
    await client.end();
  }
}

async function main(): Promise<void> {
  const adminUrl = requireEnv("DATABASE_URL");
  const testUrl = testDatabaseUrl(adminUrl);
  const databaseName = databaseNameOf(testUrl);

  await ensureDatabase(adminUrl, databaseName);

  console.info(`[test:integration] Applying migrations to ${databaseName}.`);
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testUrl },
  });

  console.info("[test:integration] Running Vitest integration suite.");
  execFileSync(
    "npx",
    ["vitest", "run", "--config", "vitest.integration.config.ts"],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: testUrl,
        TEST_DATABASE_URL: testUrl,
      },
    },
  );
}

main().catch((error: unknown) => {
  console.error("[test:integration] Failed.", error);
  process.exitCode = 1;
});
