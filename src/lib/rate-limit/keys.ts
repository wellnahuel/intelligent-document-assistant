import { createHash } from "node:crypto";

/**
 * Rate-limit keys live in PostgreSQL. Emails and IP addresses are hashed so
 * the table does not become a second, implicit directory of personal data.
 * User ids are opaque cuids and can be used directly.
 */
export function opaqueSubject(subject: string): string {
  return createHash("sha256").update(subject).digest("hex");
}

export function authKey(scope: "login-email" | "login-ip" | "register-ip" | "register-email", subject: string): string {
  return `auth:${scope}:${opaqueSubject(subject)}`;
}

export function userActionKey(
  userId: string,
  action: "upload" | "embeddings" | "ask" | "search",
): string {
  return `user:${userId}:${action}`;
}
