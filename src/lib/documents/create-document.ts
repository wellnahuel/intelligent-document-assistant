import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { DocumentStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { ExtractedPage } from "@/lib/pdf/extract-text";

type CreateDocumentInput = {
  userId: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
  pages: ExtractedPage[];
  maxDocumentsPerUser: number;
};

/**
 * Creates the document and all of its pages in one transaction.
 *
 * The user row is locked for the duration of the transaction, so two parallel
 * uploads from the same account cannot both pass the document-count check and
 * exceed the quota by racing. The lock is per user, not global.
 */
export async function createDocumentWithPages(input: CreateDocumentInput) {
  if (!Number.isInteger(input.maxDocumentsPerUser) || input.maxDocumentsPerUser < 1) {
    throw new Error("maxDocumentsPerUser must be a positive integer.");
  }

  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE
    `);

    if (locked.length === 0) {
      throw new AppError(
        "DOCUMENT_NOT_FOUND",
        "No se pudo asociar el documento a la cuenta.",
      );
    }

    const documentCount = await tx.document.count({
      where: { userId: input.userId },
    });

    if (documentCount >= input.maxDocumentsPerUser) {
      throw new AppError(
        "DOCUMENT_QUOTA_EXCEEDED",
        `Alcanzaste el límite de ${input.maxDocumentsPerUser} documentos. Borrá uno antes de subir otro.`,
      );
    }

    const document = await tx.document.create({
      data: {
        userId: input.userId,
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
