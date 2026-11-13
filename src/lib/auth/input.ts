const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 128;
export const MIN_PASSWORD_LENGTH = 10;

// Intentionally simple and deterministic. The database unique constraint is
// the authority for uniqueness; this only rejects clearly invalid input.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const GENERIC_LOGIN_ERROR = "Email o contraseña incorrectos.";
export const GENERIC_REGISTER_ERROR =
  "No se pudo crear la cuenta. Si ya tenés una, iniciá sesión.";
export const RATE_LIMITED_MESSAGE =
  "Demasiadas solicitudes. Esperá unos minutos e intentá de nuevo.";

export type LoginCredentials = {
  email: string;
  password: string;
};

export type RegistrationInput = LoginCredentials;

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

/**
 * Emails are case-insensitive for login and uniqueness. Stored and compared
 * values are trimmed and lowercased so "A@Example.com " and "a@example.com"
 * are the same account.
 */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  const email = raw.trim().toLowerCase();

  if (
    email.length === 0 ||
    email.length > MAX_EMAIL_LENGTH ||
    !EMAIL_PATTERN.test(email)
  ) {
    return null;
  }

  return email;
}

function validatePassword(raw: unknown): string | null {
  if (typeof raw !== "string") {
    return null;
  }

  if (
    raw.length < MIN_PASSWORD_LENGTH ||
    raw.length > MAX_PASSWORD_LENGTH
  ) {
    return null;
  }

  return raw;
}

/**
 * Parses the credentials object Auth.js passes to `authorize`. Invalid input
 * is treated as invalid credentials, never as an internal error.
 */
export function parseLoginCredentials(
  raw: Partial<Record<"email" | "password", unknown>> | undefined,
): LoginCredentials | null {
  if (!raw) {
    return null;
  }

  const email = normalizeEmail(raw.email);
  const password = validatePassword(raw.password);

  if (!email || !password) {
    return null;
  }

  return { email, password };
}

export function validateRegistrationInput(
  rawEmail: unknown,
  rawPassword: unknown,
): ValidationResult<RegistrationInput> {
  const email = normalizeEmail(rawEmail);

  if (!email) {
    return { ok: false, message: "Ingresá un email válido." };
  }

  const password = validatePassword(rawPassword);

  if (!password) {
    return {
      ok: false,
      message: `La contraseña debe tener entre ${MIN_PASSWORD_LENGTH} y ${MAX_PASSWORD_LENGTH} caracteres.`,
    };
  }

  return { ok: true, value: { email, password } };
}
