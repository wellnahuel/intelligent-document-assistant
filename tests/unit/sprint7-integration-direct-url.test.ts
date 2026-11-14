import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Regression guard for S4/S6: prisma.config.ts prefers DIRECT_URL for CLI
 * commands, so the integration runner must pin BOTH URLs to the isolated
 * *_test database. Otherwise an inherited DIRECT_URL from a developer's Neon
 * environment would receive the migrations.
 */
describe("integration test database isolation", () => {
  it("pins DATABASE_URL and DIRECT_URL to the test database", () => {
    const source = readFileSync(
      new URL("../../scripts/test-integration.ts", import.meta.url),
      "utf8",
    );

    expect(source).toContain("DATABASE_URL: testUrl");
    expect(source).toContain("DIRECT_URL: testUrl");
  });
});
