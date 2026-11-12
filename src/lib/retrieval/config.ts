/**
 * Retrieval and reranking configuration. Every value is optional: the normal
 * evaluation run works without a rerank model, and the application never
 * fails to boot because reranking is not configured.
 */

const DEFAULT_CANDIDATES = 20;
const DEFAULT_RRF_K = 60;
const DEFAULT_EVAL_TOP_K = 5;
const DEFAULT_RERANK_TOP_N = 5;
const DEFAULT_RERANK_TIMEOUT_MS = 20_000;

const MAX_CANDIDATES = 100;
const MAX_RRF_K = 1_000;
const MAX_EVAL_TOP_K = 50;
const MAX_RERANK_TOP_N = 50;
const MIN_RERANK_TIMEOUT_MS = 1_000;
const MAX_RERANK_TIMEOUT_MS = 120_000;

export type RerankDisabledReason = "missing_model" | "missing_api_key";

export type RerankConfig = {
  enabled: boolean;
  model: string | null;
  /**
   * Server-only secret. Never serialize this object into a client response or
   * a report.
   */
  apiKey: string | null;
  topN: number;
  timeoutMs: number;
  disabledReason: RerankDisabledReason | null;
};

export type RetrievalConfig = {
  /** Candidates requested from each source before RRF fusion. */
  candidates: number;
  rrfK: number;
  /** Metrics cutoff used by the evaluation CLI. */
  evalTopK: number;
  rerank: RerankConfig;
};

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
      `[retrieval] Ignoring invalid ${name}="${raw}". Expected an integer between ${minimum} and ${maximum}; using ${fallback}.`,
    );
    return fallback;
  }

  return value;
}

function readOptionalString(name: string): string | null {
  const raw = process.env[name]?.trim();

  return raw ? raw : null;
}

export function getRetrievalConfig(): RetrievalConfig {
  const model = readOptionalString("RERANK_MODEL");
  const apiKey =
    readOptionalString("RERANK_API_KEY") ??
    readOptionalString("OPENROUTER_API_KEY");

  let disabledReason: RerankDisabledReason | null = null;

  if (!model) {
    disabledReason = "missing_model";
  } else if (!apiKey) {
    disabledReason = "missing_api_key";
  }

  return {
    candidates: readIntegerInRange(
      "RETRIEVAL_CANDIDATES",
      DEFAULT_CANDIDATES,
      1,
      MAX_CANDIDATES,
    ),
    rrfK: readIntegerInRange("RETRIEVAL_RRF_K", DEFAULT_RRF_K, 1, MAX_RRF_K),
    evalTopK: readIntegerInRange(
      "EVAL_TOP_K",
      DEFAULT_EVAL_TOP_K,
      1,
      MAX_EVAL_TOP_K,
    ),
    rerank: {
      enabled: disabledReason === null,
      model,
      apiKey,
      topN: readIntegerInRange(
        "RERANK_TOP_N",
        DEFAULT_RERANK_TOP_N,
        1,
        MAX_RERANK_TOP_N,
      ),
      timeoutMs: readIntegerInRange(
        "RERANK_TIMEOUT_MS",
        DEFAULT_RERANK_TIMEOUT_MS,
        MIN_RERANK_TIMEOUT_MS,
        MAX_RERANK_TIMEOUT_MS,
      ),
      disabledReason,
    },
  };
}
