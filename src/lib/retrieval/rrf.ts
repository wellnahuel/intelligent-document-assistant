import type {
  HybridHit,
  RetrievalHit,
  RetrievalSource,
  SourceRank,
} from "@/lib/retrieval/types";

/**
 * Reciprocal Rank Fusion over already ranked source lists.
 *
 * Vector distance and lexical relevance do not share a scale, so this function
 * uses positions only: `score(d) = Σ 1 / (k + rank_s(d))`. The caller owns the
 * default constant (`RETRIEVAL_RRF_K`, default 60 in the retrieval config); this
 * function receives whatever `k` the caller resolved.
 */
export type RankedList = {
  source: RetrievalSource;
  hits: readonly RetrievalHit[];
};

type AccumulatedHit = {
  hit: RetrievalHit;
  rrfScore: number;
  sourceRanks: SourceRank[];
  bestRank: number;
};

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer; received ${value}.`);
  }
}

function assertCompatibleMetadata(first: RetrievalHit, second: RetrievalHit): void {
  if (first.documentId !== second.documentId) {
    throw new Error(
      `Conflicting metadata for chunk "${first.chunkId}": the same chunk id appears with a different documentId.`,
    );
  }

  if (first.pageNumber !== second.pageNumber) {
    throw new Error(
      `Conflicting metadata for chunk "${first.chunkId}": the same chunk id appears with a different pageNumber.`,
    );
  }

  if (first.content !== second.content) {
    throw new Error(
      `Conflicting metadata for chunk "${first.chunkId}": the same chunk id appears with a different content.`,
    );
  }
}

function compareAccumulated(left: AccumulatedHit, right: AccumulatedHit): number {
  if (left.rrfScore !== right.rrfScore) {
    return right.rrfScore - left.rrfScore;
  }

  if (left.bestRank !== right.bestRank) {
    return left.bestRank - right.bestRank;
  }

  if (left.hit.chunkId < right.hit.chunkId) {
    return -1;
  }

  if (left.hit.chunkId > right.hit.chunkId) {
    return 1;
  }

  return 0;
}

/**
 * Deduplicates each source list by chunk id (keeping the first occurrence),
 * assigns 1-based ranks, and sums one contribution per source list where the
 * chunk appeared. The first item wins ties by best rank and then by chunk id.
 */
export function reciprocalRankFusion(
  lists: readonly RankedList[],
  options: { k: number; limit: number },
): HybridHit[] {
  assertPositiveInteger(options.k, "k");
  assertPositiveInteger(options.limit, "limit");

  const accumulated = new Map<string, AccumulatedHit>();

  for (const list of lists) {
    const seenInList = new Map<string, RetrievalHit>();
    let rank = 0;

    for (const hit of list.hits) {
      const previousInList = seenInList.get(hit.chunkId);

      if (previousInList) {
        assertCompatibleMetadata(previousInList, hit);
        continue;
      }

      seenInList.set(hit.chunkId, hit);
      rank += 1;

      const contribution = 1 / (options.k + rank);
      const existing = accumulated.get(hit.chunkId);

      if (existing) {
        assertCompatibleMetadata(existing.hit, hit);
        existing.rrfScore += contribution;
        existing.sourceRanks.push({
          source: list.source,
          rank,
          score: hit.score,
        });
        existing.bestRank = Math.min(existing.bestRank, rank);
        continue;
      }

      accumulated.set(hit.chunkId, {
        hit: { ...hit },
        rrfScore: contribution,
        sourceRanks: [{ source: list.source, rank, score: hit.score }],
        bestRank: rank,
      });
    }
  }

  return [...accumulated.values()]
    .sort(compareAccumulated)
    .slice(0, options.limit)
    .map((entry) => ({
      ...entry.hit,
      score: entry.rrfScore,
      rrfScore: entry.rrfScore,
      sourceRanks: entry.sourceRanks,
    }));
}
