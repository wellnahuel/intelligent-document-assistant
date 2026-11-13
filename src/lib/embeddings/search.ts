import {
  getEmbeddingConfig,
  getEmbeddingModelInfo,
  getSearchConfig,
} from "@/lib/embeddings/config";
import {
  parseSearchQuery,
  parseTopK,
  type SearchRequestInput,
} from "@/lib/embeddings/input";
import { loadEmbeddingProviderOrThrow } from "@/lib/embeddings/load-provider";
import {
  countIndexedEmbeddingsForUser,
  findNearestChunksForUser,
} from "@/lib/embeddings/store";
import type {
  ChunkSearchResponseDto,
  ChunkSearchResultDto,
} from "@/lib/embeddings/types";
import { cosineSimilarityFromDistance } from "@/lib/embeddings/vector";
import { AppError } from "@/lib/errors";

export async function searchChunks(
  userId: string,
  input: SearchRequestInput,
): Promise<ChunkSearchResponseDto> {
  const searchConfig = getSearchConfig();
  const query = parseSearchQuery(input.query, searchConfig.queryMaxChars);
  const topK = parseTopK(input.topK, searchConfig);
  const model = getEmbeddingModelInfo(getEmbeddingConfig());
  const indexedChunkCount = await countIndexedEmbeddingsForUser(userId, model);

  // Avoid downloading/loading the model just to search an empty index.
  if (indexedChunkCount === 0) {
    return {
      query,
      topK,
      model,
      indexedChunkCount,
      results: [],
    };
  }

  const provider = await loadEmbeddingProviderOrThrow();
  let vector: number[];

  try {
    vector = await provider.embedQuery(query);
  } catch (error) {
    console.error("[embeddings] Could not embed the search query.", error);
    throw new AppError(
      "EMBEDDING_QUERY_FAILED",
      "No se pudo generar el vector de la pregunta.",
    );
  }

  const rows = await findNearestChunksForUser(vector, model, userId, topK);
  const results: ChunkSearchResultDto[] = rows.map((row) => {
    const distance =
      typeof row.distance === "number" ? row.distance : Number(row.distance);

    if (!Number.isFinite(distance)) {
      throw new Error("PostgreSQL returned a non-finite cosine distance.");
    }

    return {
      chunkId: row.chunkId,
      documentId: row.documentId,
      documentName: row.documentName,
      pageNumber: row.pageNumber,
      chunkIndex: row.chunkIndex,
      content: row.content,
      distance,
      similarity: cosineSimilarityFromDistance(distance),
    };
  });

  return {
    query,
    topK,
    model,
    indexedChunkCount,
    results,
  };
}
