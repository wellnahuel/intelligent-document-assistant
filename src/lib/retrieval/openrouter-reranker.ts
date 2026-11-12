import { z } from "zod";

import {
  RerankValidationError,
  mapRerankResults,
} from "@/lib/retrieval/reranker";
import type {
  RerankCandidate,
  RerankItem,
  RerankOutcome,
  RerankRequest,
  Reranker,
  RerankUsage,
} from "@/lib/retrieval/types";

/**
 * Optional OpenRouter reranking client for the Sprint 5 evaluation. The key is
 * server-only and is never logged. Enabling reranking sends the query and the
 * candidate chunks to an external provider, so callers should use fictional
 * evaluation fixtures and keep the feature disabled unless it is configured.
 */

export const OPENROUTER_RERANK_URL = "https://openrouter.ai/api/v1/rerank";

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type RerankErrorKind =
  | "timeout"
  | "network"
  | "http"
  | "malformed"
  | "upstream"
  | "validation";

export class RerankError extends Error {
  readonly kind: RerankErrorKind;
  readonly status: number | null;

  constructor(kind: RerankErrorKind, message: string, status?: number | null) {
    super(message);
    this.name = "RerankError";
    this.kind = kind;
    this.status = status ?? null;
  }
}

type RerankClientConfig = {
  apiKey: string;
  model: string;
  timeoutMs: number;
};

const usageSchema = z.object({
  search_units: z.number().finite().optional(),
  total_tokens: z.number().finite().optional(),
  cost: z.number().finite().optional(),
});

const providerErrorSchema = z.object({
  code: z.union([z.number(), z.string()]).optional(),
  message: z.string().optional(),
});

const resultSchema = z.object({
  index: z.number().int(),
  relevance_score: z.number().finite(),
});

const responseSchema = z.object({
  model: z.string().optional(),
  results: z.array(resultSchema).optional(),
  usage: usageSchema.nullable().optional(),
  error: providerErrorSchema.optional(),
});

function finiteOrNull(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeUsage(
  usage: z.infer<typeof usageSchema> | null | undefined,
): RerankUsage | null {
  if (!usage) {
    return null;
  }

  return {
    searchUnits: finiteOrNull(usage.search_units),
    totalTokens: finiteOrNull(usage.total_tokens),
    cost: finiteOrNull(usage.cost),
  };
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

function assertValidInput(input: {
  config: RerankClientConfig;
  query: string;
  candidates: readonly RerankCandidate[];
  topN: number;
}): void {
  if (input.query.trim().length === 0) {
    throw new RerankError("validation", "The rerank query must not be empty.");
  }

  if (input.candidates.length === 0) {
    throw new RerankError("validation", "Rerank requires at least one candidate.");
  }

  if (!Number.isInteger(input.topN) || input.topN <= 0) {
    throw new RerankError("validation", "Rerank topN must be a positive integer.");
  }

  if (input.config.apiKey.trim().length === 0) {
    throw new RerankError("validation", "A rerank API key is required.");
  }

  if (input.config.model.trim().length === 0) {
    throw new RerankError("validation", "A rerank model is required.");
  }

  if (
    !Number.isFinite(input.config.timeoutMs) ||
    input.config.timeoutMs <= 0
  ) {
    throw new RerankError(
      "validation",
      "The rerank timeout must be a positive number of milliseconds.",
    );
  }
}

export async function requestRerank(input: {
  config: RerankClientConfig;
  query: string;
  candidates: readonly RerankCandidate[];
  topN: number;
  fetchImpl?: FetchLike;
}): Promise<RerankOutcome> {
  assertValidInput(input);

  const fetchImpl = input.fetchImpl ?? fetch;
  const startedAt = performance.now();
  let response: Response;

  try {
    response = await fetchImpl(OPENROUTER_RERANK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.config.apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Intelligent Document Assistant",
      },
      body: JSON.stringify({
        model: input.config.model,
        query: input.query,
        documents: input.candidates.map((candidate) => candidate.content),
        top_n: input.topN,
      }),
      signal: AbortSignal.timeout(input.config.timeoutMs),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new RerankError(
        "timeout",
        "The OpenRouter rerank request exceeded the configured timeout.",
      );
    }

    throw new RerankError(
      "network",
      "The OpenRouter rerank request could not be completed.",
    );
  }

  let rawBody: string;

  try {
    rawBody = await response.text();
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new RerankError(
        "timeout",
        "The OpenRouter rerank response exceeded the configured timeout.",
      );
    }

    throw new RerankError(
      "malformed",
      "The OpenRouter rerank response could not be read.",
    );
  }

  const latencyMs = performance.now() - startedAt;

  if (!response.ok) {
    throw new RerankError(
      "http",
      "OpenRouter rerank returned an error status.",
      response.status,
    );
  }

  let body: unknown;

  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new RerankError(
      "malformed",
      "OpenRouter rerank returned a response that is not valid JSON.",
      response.status,
    );
  }

  const parsed = responseSchema.safeParse(body);

  if (!parsed.success) {
    throw new RerankError(
      "malformed",
      "OpenRouter rerank returned an unexpected response shape.",
      response.status,
    );
  }

  if (parsed.data.error) {
    throw new RerankError(
      "upstream",
      "OpenRouter rerank reported a provider error.",
      response.status,
    );
  }

  if (!parsed.data.results) {
    throw new RerankError(
      "malformed",
      "OpenRouter rerank returned an unexpected response shape.",
      response.status,
    );
  }

  let items: RerankItem[];

  try {
    items = mapRerankResults({
      candidates: input.candidates,
      results: parsed.data.results.map((result) => ({
        index: result.index,
        relevanceScore: result.relevance_score,
      })),
      topN: input.topN,
    });
  } catch (error) {
    if (error instanceof RerankValidationError) {
      throw new RerankError(
        "validation",
        "OpenRouter rerank returned invalid results.",
        response.status,
      );
    }

    throw error;
  }

  return {
    model: parsed.data.model ?? input.config.model,
    items,
    usage: normalizeUsage(parsed.data.usage),
    latencyMs,
  };
}

export function createOpenRouterReranker(
  config: RerankClientConfig,
  fetchImpl?: FetchLike,
): Reranker {
  return {
    model: config.model,
    rerank: (input: RerankRequest) =>
      requestRerank({
        config,
        query: input.query,
        candidates: input.candidates,
        topN: input.topN,
        fetchImpl,
      }),
  };
}
