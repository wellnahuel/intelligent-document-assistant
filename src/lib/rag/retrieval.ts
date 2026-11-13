import "server-only";

import {
  getEmbeddingConfig,
  getEmbeddingModelInfo,
} from "@/lib/embeddings/config";
import { loadEmbeddingProviderOrThrow } from "@/lib/embeddings/load-provider";
import {
  countDocumentEmbeddings,
  findNearestChunksForDocument,
} from "@/lib/embeddings/store";
import type { EmbeddingModelInfo } from "@/lib/embeddings/types";
import type { RetrievedChunk } from "@/lib/rag/types";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/db";

export type RetrievalResult = {
  documentId: string;
  documentName: string;
  model: EmbeddingModelInfo;
  indexedChunkCount: number;
  results: RetrievedChunk[];
};

export async function retrieveDocumentChunks(input: {
  userId: string;
  documentId: string;
  question: string;
  topK: number;
}): Promise<RetrievalResult> {
  const document = await prisma.document.findFirst({
    where: { id: input.documentId, userId: input.userId },
    select: {
      id: true,
      originalFilename: true,
    },
  });

  if (!document) {
    throw new AppError(
      "DOCUMENT_NOT_FOUND",
      "Documento no encontrado.",
    );
  }

  const model = getEmbeddingModelInfo(getEmbeddingConfig());
  const indexedChunkCount = await countDocumentEmbeddings(
    input.userId,
    document.id,
    model,
  );

  if (indexedChunkCount === 0) {
    return {
      documentId: document.id,
      documentName: document.originalFilename,
      model,
      indexedChunkCount,
      results: [],
    };
  }

  const provider = await loadEmbeddingProviderOrThrow();
  let vector: number[];

  try {
    vector = await provider.embedQuery(input.question);
  } catch (error) {
    console.error("[rag] Could not embed the question.", error);
    throw new AppError(
      "EMBEDDING_QUERY_FAILED",
      "No se pudo generar el vector de la pregunta.",
    );
  }

  const rows = await findNearestChunksForDocument(
    vector,
    model,
    document.id,
    input.userId,
    input.topK,
  );

  const results: RetrievedChunk[] = rows.map((row) => {
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
    };
  });

  return {
    documentId: document.id,
    documentName: document.originalFilename,
    model,
    indexedChunkCount,
    results,
  };
}
