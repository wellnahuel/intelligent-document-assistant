import { searchLexicalChunks } from "@/lib/retrieval/lexical";
import { reciprocalRankFusion } from "@/lib/retrieval/rrf";
import { searchVectorCandidates } from "@/lib/retrieval/vector";
import type { EmbeddingModelInfo } from "@/lib/embeddings/types";
import type { HybridHit } from "@/lib/retrieval/types";

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer; received ${value}.`);
  }
}

/**
 * Hybrid strategy: fetch a candidate window from the vector and lexical
 * strategies, then fuse their ranks with RRF. Cosine similarity/distance and
 * the lexical score are never added directly; only positions matter. The
 * candidate window is at least as large as `topK` so the fused list can reach
 * the requested depth.
 */
export async function searchHybridCandidates(input: {
  documentId: string;
  query: string;
  vector: readonly number[];
  model: EmbeddingModelInfo;
  candidates: number;
  rrfK: number;
  topK: number;
}): Promise<HybridHit[]> {
  assertPositiveInteger(input.candidates, "candidates");
  assertPositiveInteger(input.topK, "topK");

  const candidateCount = Math.max(input.candidates, input.topK);

  const [vectorHits, lexicalHits] = await Promise.all([
    searchVectorCandidates({
      documentId: input.documentId,
      vector: input.vector,
      model: input.model,
      topK: candidateCount,
    }),
    searchLexicalChunks({
      documentId: input.documentId,
      query: input.query,
      topK: candidateCount,
    }),
  ]);

  return reciprocalRankFusion(
    [
      { source: "vector", hits: vectorHits },
      { source: "lexical", hits: lexicalHits },
    ],
    { k: input.rrfK, limit: input.topK },
  );
}
