import { prisma } from "@/lib/db";

export async function listDocuments() {
  return prisma.document.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function getDocumentWithPages(id: string) {
  return prisma.document.findUnique({
    where: { id },
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
