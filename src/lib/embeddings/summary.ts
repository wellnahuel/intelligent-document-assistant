import {
  getEmbeddingConfig,
  getEmbeddingModelInfo,
} from "@/lib/embeddings/config";
import {
  countDocumentChunks,
  countDocumentEmbeddings,
} from "@/lib/embeddings/store";
import type { DocumentEmbeddingSummaryDto } from "@/lib/embeddings/types";

export async function getDocumentEmbeddingSummary(
  userId: string,
  documentId: string,
): Promise<DocumentEmbeddingSummaryDto> {
  const model = getEmbeddingModelInfo(getEmbeddingConfig());
  const [chunkCount, embeddedChunkCount] = await Promise.all([
    countDocumentChunks(userId, documentId),
    countDocumentEmbeddings(userId, documentId, model),
  ]);

  return {
    model,
    chunkCount,
    embeddedChunkCount,
  };
}
