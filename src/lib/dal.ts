import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AppError } from "@/lib/errors";

export type SessionUser = {
  id: string;
  email: string;
};

/**
 * Single source of identity for server components, server actions and route
 * handlers. The id comes from the verified Auth.js session, never from a
 * request body, query parameter or client-provided value.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const session = await auth();
  const sessionUser = session?.user;
  const id = sessionUser?.id;

  if (typeof id !== "string" || id.length === 0) {
    return null;
  }

  return {
    id,
    email: sessionUser?.email ?? "",
  };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function requireApiUser(): Promise<SessionUser> {
  const user = await getSessionUser();

  if (!user) {
    throw new AppError(
      "UNAUTHENTICATED",
      "Iniciá sesión para acceder a este recurso.",
    );
  }

  return user;
}
