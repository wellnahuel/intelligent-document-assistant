/**
 * Retrieval metrics for the Sprint 5 gold set.
 *
 * Precision@k divides by k, not by the number of results actually returned.
 * The rule is applied to every strategy so a short result list cannot inflate
 * precision. Recall@k divides by the number of relevant chunks.
 */

export type RetrievalMetrics = {
  recallAtK: number | null;
  precisionAtK: number;
  reciprocalRank: number;
};

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer; received ${value}.`);
  }
}

export function dedupeChunkIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const id of ids) {
    if (typeof id !== "string" || id.length === 0) {
      continue;
    }

    if (!seen.has(id)) {
      seen.add(id);
      unique.push(id);
    }
  }

  return unique;
}

export function recallAtK(
  relevantChunkIds: readonly string[],
  retrievedChunkIds: readonly string[],
  k: number,
): number | null {
  assertPositiveInteger(k, "k");

  const relevant = dedupeChunkIds(relevantChunkIds);

  if (relevant.length === 0) {
    return null;
  }

  const retrieved = new Set(dedupeChunkIds(retrievedChunkIds).slice(0, k));
  const hits = relevant.filter((id) => retrieved.has(id)).length;

  return hits / relevant.length;
}

/**
 * Precision@k = relevant items in the first k positions divided by k. Missing
 * positions count as non-relevant, which keeps strategies with different
 * result counts comparable.
 */
export function precisionAtK(
  relevantChunkIds: readonly string[],
  retrievedChunkIds: readonly string[],
  k: number,
): number {
  assertPositiveInteger(k, "k");

  const relevant = new Set(dedupeChunkIds(relevantChunkIds));

  if (relevant.size === 0) {
    return 0;
  }

  const retrieved = dedupeChunkIds(retrievedChunkIds).slice(0, k);
  const hits = retrieved.filter((id) => relevant.has(id)).length;

  return hits / k;
}

/**
 * Reciprocal rank of the first relevant item in the provided ranked list.
 * The caller passes the strategy's top-k list, so this is MRR@k in practice.
 */
export function reciprocalRank(
  relevantChunkIds: readonly string[],
  retrievedChunkIds: readonly string[],
): number {
  const relevant = new Set(dedupeChunkIds(relevantChunkIds));

  if (relevant.size === 0) {
    return 0;
  }

  const retrieved = dedupeChunkIds(retrievedChunkIds);
  const firstRelevantIndex = retrieved.findIndex((id) => relevant.has(id));

  return firstRelevantIndex === -1 ? 0 : 1 / (firstRelevantIndex + 1);
}

export function computeRetrievalMetrics(
  relevantChunkIds: readonly string[],
  retrievedChunkIds: readonly string[],
  k: number,
): RetrievalMetrics {
  return {
    recallAtK: recallAtK(relevantChunkIds, retrievedChunkIds, k),
    precisionAtK: precisionAtK(relevantChunkIds, retrievedChunkIds, k),
    reciprocalRank: reciprocalRank(relevantChunkIds, retrievedChunkIds),
  };
}

export function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function roundMetric(value: number | null, digits = 4): number | null {
  if (value === null) {
    return null;
  }

  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}
