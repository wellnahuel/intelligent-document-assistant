import { prisma } from "@/lib/db";
import type { EmbeddingModelInfo } from "@/lib/embeddings/types";
import type { AskDocumentOptionDto } from "@/lib/rag/types";

export async function listAskDocumentOptions(
  userId: string,
  model: EmbeddingModelInfo,
): Promise<AskDocumentOptionDto[]> {
  const [documents, embeddings] = await Promise.all([
    prisma.document.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        originalFilename: true,
        pageCount: true,
      },
    }),
    prisma.chunkEmbedding.findMany({
      where: {
        modelId: model.modelId,
        modelRevision: model.modelRevision,
        dimensions: model.dimensions,
        chunk: {
          documentPage: {
            document: { userId },
          },
        },
      },
      select: {
        chunk: {
          select: {
            documentPage: {
              select: {
                documentId: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const counts = new Map<string, number>();

  for (const row of embeddings) {
    const documentId = row.chunk.documentPage.documentId;

    counts.set(documentId, (counts.get(documentId) ?? 0) + 1);
  }

  return documents.map((document) => ({
    id: document.id,
    originalFilename: document.originalFilename,
    pageCount: document.pageCount,
    embeddedChunkCount: counts.get(document.id) ?? 0,
  }));
}
