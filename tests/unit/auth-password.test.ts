import { describe, expect, it } from "vitest";

import {
  ARGON2ID_PARAMETERS,
  DUMMY_ARGON2ID_HASH,
  hashPassword,
  verifyPassword,
} from "@/lib/auth/password";

describe("Argon2id password storage", () => {
  it("stores an Argon2id hash with the documented OWASP starting parameters", async () => {
    const password = "correct horse battery staple";
    const passwordHash = await hashPassword(password);

    expect(passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(passwordHash).toContain("m=19456,t=2,p=1");
    expect(passwordHash).not.toContain(password);
    expect(ARGON2ID_PARAMETERS.memoryCost).toBe(19_456);
    expect(ARGON2ID_PARAMETERS.timeCost).toBe(2);
    expect(ARGON2ID_PARAMETERS.parallelism).toBe(1);
  });

  it("verifies the right password and rejects a wrong one", async () => {
    const passwordHash = await hashPassword("a-very-good-password");

    await expect(
      verifyPassword(passwordHash, "a-very-good-password"),
    ).resolves.toBe(true);
    await expect(
      verifyPassword(passwordHash, "a-very-good-password!"),
    ).resolves.toBe(false);
  });

  it("uses a fresh salt for every hash", async () => {
    const first = await hashPassword("same-password");
    const second = await hashPassword("same-password");

    expect(first).not.toBe(second);
    await expect(verifyPassword(first, "same-password")).resolves.toBe(true);
    await expect(verifyPassword(second, "same-password")).resolves.toBe(true);
  });

  it("fails closed for the legacy owner hash and malformed values", async () => {
    await expect(
      verifyPassword("!legacy-account-no-login", "anything"),
    ).resolves.toBe(false);
    await expect(verifyPassword("", "anything")).resolves.toBe(false);
    await expect(
      verifyPassword(DUMMY_ARGON2ID_HASH, "dummy-password-not-used"),
    ).resolves.toBe(true);
  });
});
