import { z } from "zod";

import type { EmbeddingModelInfo, EmbeddingProvider } from "@/lib/embeddings/types";
import {
  EMBEDDING_DIMENSIONS,
  assertEmbeddingVector,
} from "@/lib/embeddings/vector";

export const OPENROUTER_EMBEDDINGS_URL =
  "https://openrouter.ai/api/v1/embeddings";

export type OpenRouterEmbeddingErrorKind =
  | "timeout"
  | "network"
  | "rate_limited"
  | "quota"
  | "http"
  | "malformed"
  | "dimension";

/**
 * Transport error for the remote embedding provider. Messages never include
 * the provider response body, the input text or the API key.
 */
export class OpenRouterEmbeddingError extends Error {
  readonly kind: OpenRouterEmbeddingErrorKind;
  readonly status: number | null;

  constructor(kind: OpenRouterEmbeddingErrorKind, status?: number) {
    super("The remote embedding provider request failed.");
    this.name = "OpenRouterEmbeddingError";
    this.kind = kind;
    this.status = status ?? null;
  }
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const responseSchema = z.object({
  data: z
    .array(
      z.object({
        embedding: z.array(z.number().finite()),
        index: z.number().int().min(0).optional(),
      }),
    )
    .min(1),
});

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

function mapHttpStatus(status: number): OpenRouterEmbeddingErrorKind {
  if (status === 429) {
    return "rate_limited";
  }

  if (status === 402) {
    return "quota";
  }

  return "http";
}

function orderByIndex(
  data: Array<{ embedding: number[]; index?: number }>,
): number[][] {
  const indexed = data.every((item) => typeof item.index === "number");

  if (!indexed) {
    return data.map((item) => item.embedding);
  }

  const sorted = [...data].sort(
    (left, right) => (left.index ?? 0) - (right.index ?? 0),
  );
  const valid =
    sorted.length === data.length &&
    sorted.every((item, position) => item.index === position);

  if (!valid) {
    throw new OpenRouterEmbeddingError("malformed");
  }

  return sorted.map((item) => item.embedding);
}

/**
 * Calls the OpenRouter embeddings endpoint once. Deliberately no retries:
 * a retry would duplicate token usage and latency, and the caller already
 * reports a safe error to the user.
 */
export async function requestEmbeddings(input: {
  apiKey: string;
  model: string;
  texts: readonly string[];
  timeoutMs: number;
  dimensions?: number;
  fetchImpl?: FetchLike;
}): Promise<number[][]> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const dimensions = input.dimensions ?? EMBEDDING_DIMENSIONS;
  let response: Response;

  try {
    response = await fetchImpl(OPENROUTER_EMBEDDINGS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
        "X-Title": "Intelligent Document Assistant",
      },
      body: JSON.stringify({
        model: input.model,
        input: [...input.texts],
        dimensions,
      }),
      signal: AbortSignal.timeout(input.timeoutMs),
    });
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new OpenRouterEmbeddingError("timeout");
    }

    throw new OpenRouterEmbeddingError("network");
  }

  let rawBody: string;

  try {
    rawBody = await response.text();
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new OpenRouterEmbeddingError("timeout", response.status);
    }

    throw new OpenRouterEmbeddingError("malformed", response.status);
  }

  if (!response.ok) {
    throw new OpenRouterEmbeddingError(
      mapHttpStatus(response.status),
      response.status,
    );
  }

  let body: unknown;

  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new OpenRouterEmbeddingError("malformed", response.status);
  }

  const parsed = responseSchema.safeParse(body);

  if (!parsed.success) {
    throw new OpenRouterEmbeddingError("malformed", response.status);
  }

  const vectors = orderByIndex(parsed.data.data);

  if (vectors.length !== input.texts.length) {
    throw new OpenRouterEmbeddingError("malformed", response.status);
  }

  for (const vector of vectors) {
    try {
      assertEmbeddingVector(vector, dimensions);
    } catch {
      throw new OpenRouterEmbeddingError("dimension", response.status);
    }
  }

  return vectors;
}

/**
 * Remote provider used in deployments that must not load the local ONNX
 * model. It sends raw text: E5 prefixes belong to the local model and are not
 * applied here. The chosen remote model must match the fixed 384-dimension
 * column and must use the same configuration for documents and queries.
 */
export function createOpenRouterEmbeddingProvider(input: {
  apiKey: string;
  model: EmbeddingModelInfo;
  timeoutMs: number;
  fetchImpl?: FetchLike;
}): EmbeddingProvider {
  async function embed(texts: readonly string[]): Promise<number[][]> {
    return requestEmbeddings({
      apiKey: input.apiKey,
      model: input.model.modelId,
      texts,
      timeoutMs: input.timeoutMs,
      dimensions: input.model.dimensions,
      fetchImpl: input.fetchImpl,
    });
  }

  return {
    model: input.model,
    async embedPassages(texts) {
      if (texts.length === 0) {
        return [];
      }

      for (const text of texts) {
        if (typeof text !== "string" || text.trim().length === 0) {
          throw new Error("Cannot embed an empty passage.");
        }
      }

      return embed(texts);
    },
    async embedQuery(text) {
      const query = text.trim();

      if (!query) {
        throw new Error("Cannot embed an empty query.");
      }

      const vectors = await embed([query]);
      const vector = vectors[0];

      if (!vector) {
        throw new Error("The embedding model returned no query vector.");
      }

      return vector;
    },
  };
}
