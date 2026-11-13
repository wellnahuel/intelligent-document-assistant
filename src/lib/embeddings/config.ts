import { AppError } from "@/lib/errors";
import type { EmbeddingModelInfo } from "@/lib/embeddings/types";
import { EMBEDDING_DIMENSIONS } from "@/lib/embeddings/vector";

const DEFAULT_MODEL_ID = "Xenova/multilingual-e5-small";
// Pinned Hugging Face commit inspected for this sprint. Pinning keeps the
// downloaded files and the stored model revision reproducible.
const DEFAULT_MODEL_REVISION = "761b726dd34fb83930e26aab4e9ac3899aa1fa78";
const REMOTE_UNVERSIONED_REVISION = "openrouter-managed";
const DEFAULT_CACHE_DIR = ".cache/transformers";
const DEFAULT_BATCH_SIZE = 4;
const DEFAULT_TOP_K = 5;
const DEFAULT_MAX_TOP_K = 20;
const DEFAULT_QUERY_MAX_CHARS = 1000;
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;

const MIN_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 16;
const MAX_TOP_K_LIMIT = 50;
const MAX_QUERY_CHARS_LIMIT = 4000;
const MIN_REQUEST_TIMEOUT_MS = 1_000;
const MAX_REQUEST_TIMEOUT_MS = 120_000;

export type EmbeddingProviderKind = "local" | "openrouter";

export type EmbeddingConfig = {
  provider: EmbeddingProviderKind;
  modelId: string;
  modelRevision: string;
  dimensions: number;
  cacheDir: string;
  batchSize: number;
  dtype: "fp32";
  requestTimeoutMs: number;
};

export type SearchConfig = {
  defaultTopK: number;
  maxTopK: number;
  queryMaxChars: number;
};

function readNonEmptyString(name: string, fallback: string): string {
  const raw = process.env[name]?.trim();

  return raw ? raw : fallback;
}

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
      `[embeddings] Ignoring invalid ${name}="${raw}". Expected an integer between ${minimum} and ${maximum}; using ${fallback}.`,
    );
    return fallback;
  }

  return value;
}

function readProvider(): EmbeddingProviderKind {
  const raw = process.env.EMBEDDING_PROVIDER?.trim().toLowerCase();

  if (!raw) {
    return "local";
  }

  if (raw === "local" || raw === "openrouter") {
    return raw;
  }

  console.warn(
    `[embeddings] Ignoring invalid EMBEDDING_PROVIDER="${raw}". Expected "local" or "openrouter"; using "local".`,
  );
  return "local";
}

export function getEmbeddingConfig(): EmbeddingConfig {
  const provider = readProvider();
  const configuredModelId = process.env.EMBEDDING_MODEL_ID?.trim();

  // The local default names a Hugging Face repository, which is not a valid
  // OpenRouter model id. Requiring an explicit value avoids silently sending
  // the local slug to the remote endpoint.
  if (provider === "openrouter" && !configuredModelId) {
    throw new AppError(
      "EMBEDDING_MODEL_UNAVAILABLE",
      "El proveedor remoto de embeddings requiere EMBEDDING_MODEL_ID con el id del modelo de OpenRouter.",
    );
  }

  const modelId = configuredModelId || DEFAULT_MODEL_ID;
  const modelRevision =
    process.env.EMBEDDING_MODEL_REVISION?.trim() ||
    (provider === "openrouter"
      ? REMOTE_UNVERSIONED_REVISION
      : DEFAULT_MODEL_REVISION);

  return {
    provider,
    modelId,
    modelRevision,
    dimensions: EMBEDDING_DIMENSIONS,
    cacheDir: readNonEmptyString("EMBEDDING_CACHE_DIR", DEFAULT_CACHE_DIR),
    batchSize: readIntegerInRange(
      "EMBEDDING_BATCH_SIZE",
      DEFAULT_BATCH_SIZE,
      MIN_BATCH_SIZE,
      MAX_BATCH_SIZE,
    ),
    // Fixed because the SQL column is vector(384). The dtype is part of the
    // local model configuration and must not change silently.
    dtype: "fp32",
    requestTimeoutMs: readIntegerInRange(
      "OPENROUTER_EMBEDDING_TIMEOUT_MS",
      DEFAULT_REQUEST_TIMEOUT_MS,
      MIN_REQUEST_TIMEOUT_MS,
      MAX_REQUEST_TIMEOUT_MS,
    ),
  };
}

export function getEmbeddingModelInfo(
  config: EmbeddingConfig = getEmbeddingConfig(),
): EmbeddingModelInfo {
  return {
    modelId: config.modelId,
    modelRevision: config.modelRevision,
    dimensions: config.dimensions,
  };
}

export function getSearchConfig(): SearchConfig {
  const maxTopK = readIntegerInRange(
    "SEARCH_MAX_TOP_K",
    DEFAULT_MAX_TOP_K,
    1,
    MAX_TOP_K_LIMIT,
  );
  const defaultTopK = Math.min(
    readIntegerInRange(
      "SEARCH_DEFAULT_TOP_K",
      DEFAULT_TOP_K,
      1,
      MAX_TOP_K_LIMIT,
    ),
    maxTopK,
  );

  return {
    defaultTopK,
    maxTopK,
    queryMaxChars: readIntegerInRange(
      "SEARCH_QUERY_MAX_CHARS",
      DEFAULT_QUERY_MAX_CHARS,
      1,
      MAX_QUERY_CHARS_LIMIT,
    ),
  };
}
