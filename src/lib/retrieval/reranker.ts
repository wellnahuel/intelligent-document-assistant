import type { RerankCandidate, RerankItem } from "@/lib/retrieval/types";

/**
 * Pure validation and mapping for rerank provider responses. This module never
 * performs network calls and never includes candidate text in error messages,
 * so a validation failure can be reported safely.
 */

export class RerankValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RerankValidationError";
  }
}

type ProviderResult = {
  index: number;
  relevanceScore: number;
};

export function mapRerankResults(input: {
  candidates: readonly RerankCandidate[];
  results: readonly ProviderResult[];
  topN: number;
}): RerankItem[] {
  const { candidates, results, topN } = input;

  if (candidates.length === 0) {
    throw new RerankValidationError("Rerank requires at least one candidate.");
  }

  if (!Number.isInteger(topN) || topN <= 0) {
    throw new RerankValidationError("Rerank topN must be a positive integer.");
  }

  if (results.length === 0) {
    throw new RerankValidationError(
      "Rerank returned no results for the sent candidates.",
    );
  }

  if (results.length > candidates.length) {
    throw new RerankValidationError(
      "Rerank returned more results than candidates.",
    );
  }

  const seenIndices = new Set<number>();
  const items: RerankItem[] = [];

  for (const result of results) {
    if (!Number.isInteger(result.index)) {
      throw new RerankValidationError(
        "Rerank returned a non-integer candidate index.",
      );
    }

    if (result.index < 0 || result.index >= candidates.length) {
      throw new RerankValidationError(
        "Rerank returned an out-of-range candidate index.",
      );
    }

    if (seenIndices.has(result.index)) {
      throw new RerankValidationError(
        "Rerank returned a duplicate candidate index.",
      );
    }

    if (!Number.isFinite(result.relevanceScore)) {
      throw new RerankValidationError(
        "Rerank returned a non-finite relevance score.",
      );
    }

    const candidate = candidates[result.index];

    if (!candidate) {
      throw new RerankValidationError(
        "Rerank returned an out-of-range candidate index.",
      );
    }

    seenIndices.add(result.index);
    items.push({
      chunkId: candidate.chunkId,
      providerIndex: result.index,
      relevanceScore: result.relevanceScore,
    });
  }

  items.sort(
    (a, b) =>
      b.relevanceScore - a.relevanceScore ||
      a.providerIndex - b.providerIndex,
  );

  return items.slice(0, topN);
}
