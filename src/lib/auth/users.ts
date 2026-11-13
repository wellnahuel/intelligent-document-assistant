import "server-only";

import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { hashPassword } from "@/lib/auth/password";

export type UserRecord = {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
};

export async function findUserByEmail(
  email: string,
): Promise<UserRecord | null> {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      name: true,
    },
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

export async function createUser(input: {
  email: string;
  password: string;
}): Promise<{ id: string; email: string }> {
  const passwordHash = await hashPassword(input.password);

  try {
    return await prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
      },
      select: { id: true, email: true },
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Registration failures are intentionally generic so the form does not
      // become an email-existence oracle.
      throw new AppError(
        "REGISTRATION_FAILED",
        "No se pudo crear la cuenta. Si ya tenés una, iniciá sesión.",
      );
    }

    throw error;
  }
}
