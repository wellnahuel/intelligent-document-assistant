import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { EmbeddingModelInfo } from "@/lib/embeddings/types";
import { formatVectorForSql } from "@/lib/embeddings/vector";

export type EmbeddableChunk = {
  id: string;
  content: string;
  chunkIndex: number;
  pageNumber: number;
};

export type EmbeddingToStore = {
  chunkId: string;
  vector: number[];
};

export type NearestChunkRow = {
  chunkId: string;
  content: string;
  chunkIndex: number;
  pageNumber: number;
  documentId: string;
  documentName: string;
  distance: number | string;
};

export async function documentExists(documentId: string): Promise<boolean> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { id: true },
  });

  return document !== null;
}

export async function listDocumentChunks(
  documentId: string,
): Promise<EmbeddableChunk[]> {
  const rows = await prisma.documentChunk.findMany({
    where: { documentPage: { documentId } },
    select: {
      id: true,
      content: true,
      chunkIndex: true,
      documentPage: {
        select: { pageNumber: true },
      },
    },
  });

  return rows
    .map((row) => ({
      id: row.id,
      content: row.content,
      chunkIndex: row.chunkIndex,
      pageNumber: row.documentPage.pageNumber,
    }))
    .sort(
      (left, right) =>
        left.pageNumber - right.pageNumber ||
        left.chunkIndex - right.chunkIndex,
    );
}

export async function countDocumentChunks(
  documentId: string,
): Promise<number> {
  return prisma.documentChunk.count({
    where: { documentPage: { documentId } },
  });
}

/**
 * Returns the chunks that already have a compatible embedding for the exact
 * model configuration. A row with a different revision or dimension is not
 * considered compatible and will be regenerated.
 */
export async function findExistingChunkIds(
  chunkIds: readonly string[],
  model: EmbeddingModelInfo,
): Promise<Set<string>> {
  if (chunkIds.length === 0) {
    return new Set();
  }

  const rows = await prisma.chunkEmbedding.findMany({
    where: {
      chunkId: { in: [...chunkIds] },
      modelId: model.modelId,
      modelRevision: model.modelRevision,
      dimensions: model.dimensions,
    },
    select: { chunkId: true },
  });

  return new Set(rows.map((row) => row.chunkId));
}

export async function countDocumentEmbeddings(
  documentId: string,
  model: EmbeddingModelInfo,
): Promise<number> {
  return prisma.chunkEmbedding.count({
    where: {
      modelId: model.modelId,
      modelRevision: model.modelRevision,
      dimensions: model.dimensions,
      chunk: {
        documentPage: { documentId },
      },
    },
  });
}

export async function countIndexedEmbeddings(
  model: EmbeddingModelInfo,
): Promise<number> {
  return prisma.chunkEmbedding.count({
    where: {
      modelId: model.modelId,
      modelRevision: model.modelRevision,
      dimensions: model.dimensions,
    },
  });
}

/**
 * Inserts or replaces a batch of vectors in one statement. The conflict target
 * matches the unique constraint, so repeated runs cannot duplicate rows. The
 * vector is sent as a parameter and cast to ::vector, never concatenated.
 */
export async function upsertEmbeddingBatch(
  rows: readonly EmbeddingToStore[],
  model: EmbeddingModelInfo,
): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  const values = rows.map(
    (row) =>
      Prisma.sql`(${randomUUID()}, ${row.chunkId}, ${model.modelId}, ${model.modelRevision}, ${model.dimensions}, ${formatVectorForSql(row.vector, model.dimensions)}::vector)`,
  );

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "ChunkEmbedding" (
      "id",
      "chunkId",
      "modelId",
      "modelRevision",
      "dimensions",
      "embedding"
    )
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("chunkId", "modelId", "modelRevision")
    DO UPDATE SET
      "dimensions" = EXCLUDED."dimensions",
      "embedding" = EXCLUDED."embedding",
      "createdAt" = CURRENT_TIMESTAMP
  `);
}

/**
 * Exact cosine search. No ANN index is used in this sprint: the corpus is
 * small and exact ordering is easier to inspect while learning.
 */
export async function findNearestChunks(
  vector: readonly number[],
  model: EmbeddingModelInfo,
  topK: number,
): Promise<NearestChunkRow[]> {
  const vectorLiteral = formatVectorForSql(vector, model.dimensions);

  return prisma.$queryRaw<NearestChunkRow[]>(Prisma.sql`
    SELECT
      c."id" AS "chunkId",
      c."content" AS "content",
      c."chunkIndex" AS "chunkIndex",
      p."pageNumber" AS "pageNumber",
      d."id" AS "documentId",
      d."originalFilename" AS "documentName",
      (e."embedding" <=> ${vectorLiteral}::vector) AS "distance"
    FROM "ChunkEmbedding" e
    JOIN "DocumentChunk" c ON c."id" = e."chunkId"
    JOIN "DocumentPage" p ON p."id" = c."documentPageId"
    JOIN "Document" d ON d."id" = p."documentId"
    WHERE e."modelId" = ${model.modelId}
      AND e."modelRevision" = ${model.modelRevision}
      AND e."dimensions" = ${model.dimensions}
    ORDER BY e."embedding" <=> ${vectorLiteral}::vector ASC
    LIMIT ${topK}
  `);
}

/**
 * Same exact search as findNearestChunks, scoped to one document. This keeps
 * the Sprint 3 global search unchanged while Sprint 4 never mixes sources
 * from another document.
 */
export async function findNearestChunksForDocument(
  vector: readonly number[],
  model: EmbeddingModelInfo,
  documentId: string,
  topK: number,
): Promise<NearestChunkRow[]> {
  const vectorLiteral = formatVectorForSql(vector, model.dimensions);

  return prisma.$queryRaw<NearestChunkRow[]>(Prisma.sql`
    SELECT
      c."id" AS "chunkId",
      c."content" AS "content",
      c."chunkIndex" AS "chunkIndex",
      p."pageNumber" AS "pageNumber",
      d."id" AS "documentId",
      d."originalFilename" AS "documentName",
      (e."embedding" <=> ${vectorLiteral}::vector) AS "distance"
    FROM "ChunkEmbedding" e
    JOIN "DocumentChunk" c ON c."id" = e."chunkId"
    JOIN "DocumentPage" p ON p."id" = c."documentPageId"
    JOIN "Document" d ON d."id" = p."documentId"
    WHERE e."modelId" = ${model.modelId}
      AND e."modelRevision" = ${model.modelRevision}
      AND e."dimensions" = ${model.dimensions}
      AND p."documentId" = ${documentId}
    ORDER BY e."embedding" <=> ${vectorLiteral}::vector ASC
    LIMIT ${topK}
  `);
}
