import { findNearestChunksForDocument } from "@/lib/embeddings/store";
import type { EmbeddingModelInfo } from "@/lib/embeddings/types";
import { cosineSimilarityFromDistance } from "@/lib/embeddings/vector";
import type { VectorHit } from "@/lib/retrieval/types";

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer; received ${value}.`);
  }
}

/**
 * Vector strategy wrapper for the evaluation. It reuses the existing exact
 * cosine search, scoped by document and by the exact model id, revision and
 * dimensions, so incompatible embeddings never mix. `score` is derived from
 * the distance only for transparency; the hybrid strategy uses ranks instead
 * of comparing it with lexical scores.
 */
export async function searchVectorCandidates(input: {
  userId: string;
  documentId: string;
  vector: readonly number[];
  model: EmbeddingModelInfo;
  topK: number;
}): Promise<VectorHit[]> {
  assertPositiveInteger(input.topK, "topK");

  const rows = await findNearestChunksForDocument(
    input.vector,
    input.model,
    input.documentId,
    input.userId,
    input.topK,
  );

  return rows.map((row) => {
    const distance = Number(row.distance);

    if (!Number.isFinite(distance)) {
      throw new Error(
        `PostgreSQL returned a non-finite cosine distance for chunk "${row.chunkId}".`,
      );
    }

    return {
      chunkId: row.chunkId,
      documentId: row.documentId,
      documentName: row.documentName,
      pageNumber: row.pageNumber,
      chunkIndex: row.chunkIndex,
      content: row.content,
      distance,
      score: cosineSimilarityFromDistance(distance),
    };
  });
}
