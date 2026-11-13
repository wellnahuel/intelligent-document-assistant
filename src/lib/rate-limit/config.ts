const DEFAULT_MAX_DOCUMENTS_PER_USER = 20;
const DEFAULT_UPLOADS_PER_HOUR = 10;
const DEFAULT_EMBEDDINGS_PER_HOUR = 10;
const DEFAULT_QUESTIONS_PER_HOUR = 30;
const DEFAULT_SEARCHES_PER_HOUR = 60;
const DEFAULT_LOGIN_EMAIL_PER_WINDOW = 10;
const DEFAULT_LOGIN_IP_PER_WINDOW = 30;
const DEFAULT_REGISTRATIONS_IP_PER_HOUR = 5;
const DEFAULT_REGISTRATIONS_EMAIL_PER_HOUR = 3;

const MAX_LIMIT = 10_000;

export const LOGIN_WINDOW_SECONDS = 15 * 60;
export const REGISTRATION_WINDOW_SECONDS = 60 * 60;
export const ACTION_WINDOW_SECONDS = 60 * 60;

export type UsageLimits = {
  maxDocumentsPerUser: number;
  uploadsPerHour: number;
  embeddingsPerHour: number;
  questionsPerHour: number;
  searchesPerHour: number;
  loginEmailPerWindow: number;
  loginIpPerWindow: number;
  registrationsIpPerHour: number;
  registrationsEmailPerHour: number;
};

function readLimit(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value < 1 || value > MAX_LIMIT) {
    console.warn(
      `[limits] Ignoring invalid ${name}="${raw}". Expected an integer between 1 and ${MAX_LIMIT}; using ${fallback}.`,
    );
    return fallback;
  }

  return value;
}

export function getUsageLimits(): UsageLimits {
  return {
    maxDocumentsPerUser: readLimit(
      "MAX_DOCUMENTS_PER_USER",
      DEFAULT_MAX_DOCUMENTS_PER_USER,
    ),
    uploadsPerHour: readLimit(
      "UPLOAD_RATE_LIMIT_PER_HOUR",
      DEFAULT_UPLOADS_PER_HOUR,
    ),
    embeddingsPerHour: readLimit(
      "EMBEDDING_RATE_LIMIT_PER_HOUR",
      DEFAULT_EMBEDDINGS_PER_HOUR,
    ),
    questionsPerHour: readLimit(
      "ASK_RATE_LIMIT_PER_HOUR",
      DEFAULT_QUESTIONS_PER_HOUR,
    ),
    searchesPerHour: readLimit(
      "SEARCH_RATE_LIMIT_PER_HOUR",
      DEFAULT_SEARCHES_PER_HOUR,
    ),
    loginEmailPerWindow: readLimit(
      "LOGIN_RATE_LIMIT_PER_15_MIN",
      DEFAULT_LOGIN_EMAIL_PER_WINDOW,
    ),
    loginIpPerWindow: readLimit(
      "LOGIN_IP_RATE_LIMIT_PER_15_MIN",
      DEFAULT_LOGIN_IP_PER_WINDOW,
    ),
    registrationsIpPerHour: readLimit(
      "REGISTER_RATE_LIMIT_PER_HOUR",
      DEFAULT_REGISTRATIONS_IP_PER_HOUR,
    ),
    registrationsEmailPerHour: readLimit(
      "REGISTER_EMAIL_RATE_LIMIT_PER_HOUR",
      DEFAULT_REGISTRATIONS_EMAIL_PER_HOUR,
    ),
  };
}
