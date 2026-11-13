"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";

import { signIn, signOut } from "@/auth";
import {
  GENERIC_LOGIN_ERROR,
  parseLoginCredentials,
  validateRegistrationInput,
} from "@/lib/auth/input";
import type { AuthFormState } from "@/lib/auth/form-state";
import { registerUser } from "@/lib/auth/registration";
import { AppError } from "@/lib/errors";
import { getClientIp } from "@/lib/client-ip";

function stringField(formData: FormData, name: string): unknown {
  const value = formData.get(name);

  return typeof value === "string" ? value : undefined;
}

export async function loginAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const credentials = parseLoginCredentials({
    email: stringField(formData, "email"),
    password: stringField(formData, "password"),
  });

  if (!credentials) {
    return { error: GENERIC_LOGIN_ERROR };
  }

  try {
    await signIn("credentials", {
      email: credentials.email,
      password: credentials.password,
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: GENERIC_LOGIN_ERROR };
    }

    // Next.js redirects are thrown as control-flow errors; let them through.
    throw error;
  }

  return { error: GENERIC_LOGIN_ERROR };
}

export async function registerAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const validation = validateRegistrationInput(
    stringField(formData, "email"),
    stringField(formData, "password"),
  );

  if (!validation.ok) {
    return { error: validation.message };
  }

  try {
    const requestHeaders = await headers();
    await registerUser({
      email: validation.value.email,
      password: validation.value.password,
      ip: getClientIp(requestHeaders),
    });
  } catch (error) {
    if (error instanceof AppError) {
      return { error: error.message };
    }

    throw error;
  }

  try {
    await signIn("credentials", {
      email: validation.value.email,
      password: validation.value.password,
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return {
        error:
          "La cuenta se creó, pero no se pudo iniciar sesión automáticamente. Probá desde la pantalla de ingreso.",
      };
    }

    throw error;
  }

  return { error: null };
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
