import "server-only";

import { prisma } from "@/lib/db";

/**
 * Document access starts with the owner in the WHERE clause. There is no
 * global "find by id and authorize later" helper in this module: a foreign
 * id is indistinguishable from a missing one.
 */
export async function listDocumentsForUser(userId: string) {
  return prisma.document.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function getDocumentDetailForUser(
  userId: string,
  documentId: string,
) {
  return prisma.document.findFirst({
    where: { id: documentId, userId },
    include: {
      pages: {
        orderBy: { pageNumber: "asc" },
        include: {
          chunks: {
            orderBy: { chunkIndex: "asc" },
          },
        },
      },
    },
  });
}

export async function getDocumentSummaryForUser(
  userId: string,
  documentId: string,
) {
  return prisma.document.findFirst({
    where: { id: documentId, userId },
  });
}

export async function countDocumentsForUser(userId: string): Promise<number> {
  return prisma.document.count({ where: { userId } });
}

export async function deleteDocumentForUser(
  userId: string,
  documentId: string,
): Promise<number> {
  const result = await prisma.document.deleteMany({
    where: { id: documentId, userId },
  });

  return result.count;
}
