import { getChunkingConfig } from "@/lib/chunking/config";
import { chunkText } from "@/lib/chunking/chunk-text";
import type {
  ChunkGenerationPageDto,
  ChunkGenerationResultDto,
  DocumentChunkDto,
} from "@/lib/documents/types";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

/**
 * Rebuilds every chunk of a document inside a single transaction.
 *
 * Idempotency comes from deleting the document's existing chunks and
 * inserting the freshly generated ones in the same transaction. If any insert
 * fails, the deletion is rolled back and the previous chunks survive.
 * Documents and pages are never modified here.
 */
export async function regenerateDocumentChunks(
  userId: string,
  documentId: string,
): Promise<ChunkGenerationResultDto> {
  const chunking = getChunkingConfig();

  return prisma.$transaction(async (tx) => {
    const document = await tx.document.findFirst({
      where: { id: documentId, userId },
      select: {
        id: true,
        pages: {
          orderBy: { pageNumber: "asc" },
          select: {
            id: true,
            pageNumber: true,
            text: true,
          },
        },
      },
    });

    if (!document) {
      throw new AppError("DOCUMENT_NOT_FOUND", "Documento no encontrado.");
    }

    await tx.documentChunk.deleteMany({
      where: {
        documentPageId: {
          in: document.pages.map((page) => page.id),
        },
      },
    });

    const pages: ChunkGenerationPageDto[] = [];
    let chunkCount = 0;

    for (const page of document.pages) {
      const generated = chunkText(page.text, chunking);

      if (generated.length === 0) {
        pages.push({
          pageId: page.id,
          pageNumber: page.pageNumber,
          chunks: [],
        });
        continue;
      }

      const created = await tx.documentChunk.createManyAndReturn({
        data: generated.map((chunk, chunkIndex) => ({
          documentPageId: page.id,
          chunkIndex,
          content: chunk.content,
          startChar: chunk.startChar,
          endChar: chunk.endChar,
        })),
      });

      const chunks: DocumentChunkDto[] = created
        .map((chunk) => ({
          id: chunk.id,
          documentPageId: chunk.documentPageId,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          startChar: chunk.startChar,
          endChar: chunk.endChar,
        }))
        .sort((a, b) => a.chunkIndex - b.chunkIndex);

      pages.push({
        pageId: page.id,
        pageNumber: page.pageNumber,
        chunks,
      });
      chunkCount += chunks.length;
    }

    return {
      documentId: document.id,
      chunkCount,
      pageCount: document.pages.length,
      chunking,
      pages,
    };
  });
}
