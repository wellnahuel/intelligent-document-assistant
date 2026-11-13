import { describe, expect, it } from "vitest";

import {
  GENERIC_LOGIN_ERROR,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  parseLoginCredentials,
  validateRegistrationInput,
} from "@/lib/auth/input";
import { authKey } from "@/lib/rate-limit/keys";

describe("authentication input normalization", () => {
  it("trims and lowercases emails for storage and comparison", () => {
    expect(normalizeEmail("  User.Name@Example.COM ")).toBe(
      "user.name@example.com",
    );
  });

  it.each(["", "   ", "not-an-email", "@example.com", "a@b", "a@b.", null])(
    "rejects invalid email %s",
    (value) => {
      expect(normalizeEmail(value)).toBeNull();
    },
  );

  it("rejects short and oversized passwords", () => {
    expect(
      parseLoginCredentials({
        email: "user@example.com",
        password: "short",
      }),
    ).toBeNull();
    expect(
      parseLoginCredentials({
        email: "user@example.com",
        password: "x".repeat(129),
      }),
    ).toBeNull();
  });

  it("accepts a valid login and keeps the password untouched", () => {
    const password = "  spaces are valid  ";
    const parsed = parseLoginCredentials({
      email: " USER@example.com ",
      password,
    });

    expect(parsed).toEqual({
      email: "user@example.com",
      password,
    });
  });

  it("enforces the minimum registration password length", () => {
    expect(
      validateRegistrationInput(
        "user@example.com",
        "x".repeat(MIN_PASSWORD_LENGTH - 1),
      ),
    ).toEqual({
      ok: false,
      message: expect.stringContaining(String(MIN_PASSWORD_LENGTH)),
    });
    expect(
      validateRegistrationInput(
        "user@example.com",
        "x".repeat(MIN_PASSWORD_LENGTH),
      ).ok,
    ).toBe(true);
  });

  it("uses a login message that does not reveal email existence", () => {
    expect(GENERIC_LOGIN_ERROR).toBe("Email o contraseña incorrectos.");
    expect(GENERIC_LOGIN_ERROR.toLowerCase()).not.toContain("no existe");
    expect(GENERIC_LOGIN_ERROR.toLowerCase()).not.toContain("registrado");
  });
});

describe("rate-limit keys", () => {
  it("hashes email and IP subjects instead of storing them verbatim", () => {
    const key = authKey("login-email", "user@example.com");

    expect(key).not.toContain("user@example.com");
    expect(key).toMatch(/^auth:login-email:[a-f0-9]{64}$/);
    expect(key).toBe(authKey("login-email", "user@example.com"));
  });

  it("separates scopes for the same subject", () => {
    expect(authKey("login-email", "user@example.com")).not.toBe(
      authKey("register-email", "user@example.com"),
    );
  });
});
