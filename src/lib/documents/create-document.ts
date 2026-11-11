import { DocumentStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { ExtractedPage } from "@/lib/pdf/extract-text";

type CreateDocumentInput = {
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
  pages: ExtractedPage[];
};

/**
 * Creates the document and all of its pages in one transaction.
 * If a page insert fails, the document is rolled back as well.
 */
export async function createDocumentWithPages(input: CreateDocumentInput) {
  return prisma.$transaction(async (tx) => {
    const document = await tx.document.create({
      data: {
        originalFilename: input.originalFilename,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        pageCount: input.pageCount,
        status: DocumentStatus.PROCESSED,
      },
    });

    await tx.documentPage.createMany({
      data: input.pages.map((page) => ({
        documentId: document.id,
        pageNumber: page.pageNumber,
        text: page.text,
      })),
    });

    return document;
  });
}
