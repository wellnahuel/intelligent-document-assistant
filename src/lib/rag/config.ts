import type { OpenRouterConfig, RagConfig } from "@/lib/rag/types";
import { AppError } from "@/lib/errors";

const DEFAULT_TOP_K = 5;
const DEFAULT_MAX_CONTEXT_CHARS = 8000;
const DEFAULT_QUESTION_MAX_CHARS = 1000;
const DEFAULT_PROVIDER_TIMEOUT_MS = 30000;

const MAX_TOP_K = 20;
const MAX_CONTEXT_CHARS = 50000;
const MIN_CONTEXT_CHARS = 500;
const MAX_QUESTION_CHARS = 4000;
const MIN_PROVIDER_TIMEOUT_MS = 1000;
const MAX_PROVIDER_TIMEOUT_MS = 120000;

export const RAG_EXCERPT_CHARS = 320;

function readIntegerInRange(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    console.warn(
      `[rag] Ignoring invalid ${name}="${raw}". Expected an integer between ${minimum} and ${maximum}; using ${fallback}.`,
    );
    return fallback;
  }

  return value;
}

export function getRagConfig(): RagConfig {
  return {
    topK: readIntegerInRange("RAG_TOP_K", DEFAULT_TOP_K, 1, MAX_TOP_K),
    questionMaxChars: readIntegerInRange(
      "RAG_QUESTION_MAX_CHARS",
      DEFAULT_QUESTION_MAX_CHARS,
      1,
      MAX_QUESTION_CHARS,
    ),
    maxContextChars: readIntegerInRange(
      "RAG_MAX_CONTEXT_CHARS",
      DEFAULT_MAX_CONTEXT_CHARS,
      MIN_CONTEXT_CHARS,
      MAX_CONTEXT_CHARS,
    ),
    providerTimeoutMs: readIntegerInRange(
      "RAG_PROVIDER_TIMEOUT_MS",
      DEFAULT_PROVIDER_TIMEOUT_MS,
      MIN_PROVIDER_TIMEOUT_MS,
      MAX_PROVIDER_TIMEOUT_MS,
    ),
    openRouterModel: process.env.OPENROUTER_MODEL?.trim() ?? "",
  };
}

/**
 * Reads provider credentials only in the server process. The returned object
 * must never be serialized or sent to a client component.
 */
export function getOpenRouterConfig(
  config: RagConfig = getRagConfig(),
): OpenRouterConfig {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim();

  if (!apiKey || !config.openRouterModel) {
    throw new AppError(
      "OPENROUTER_NOT_CONFIGURED",
      "La generación de respuestas no está configurada en el servidor. Configurá OPENROUTER_API_KEY y OPENROUTER_MODEL.",
    );
  }

  return {
    apiKey,
    model: config.openRouterModel,
    timeoutMs: config.providerTimeoutMs,
  };
}
