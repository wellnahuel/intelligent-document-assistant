import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { createDocumentWithPages } from "@/lib/documents/create-document";
import {
  deleteDocumentForUser,
  getDocumentDetailForUser,
  listDocumentsForUser,
} from "@/lib/documents/queries";
import { regenerateDocumentChunks } from "@/lib/documents/chunks";
import { formatVectorForSql } from "@/lib/embeddings/vector";
import { generateDocumentEmbeddings } from "@/lib/embeddings/generate";
import {
  documentExistsForUser,
  findNearestChunksForDocument,
  findNearestChunksForUser,
} from "@/lib/embeddings/store";
import { listAskDocumentOptions } from "@/lib/rag/queries";
import { retrieveDocumentChunks } from "@/lib/rag/retrieval";
import { searchLexicalChunks } from "@/lib/retrieval/lexical";
import { assertRateLimit, consumeRateLimit } from "@/lib/rate-limit/limiter";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const MODEL = {
  modelId: "integration/test-model",
  modelRevision: "rev-1",
  dimensions: 384,
};

const USER_A = {
  id: "integration-user-a",
  email: "integration-a@example.test",
  passwordHash: "!integration-test-no-login",
};
const USER_B = {
  id: "integration-user-b",
  email: "integration-b@example.test",
  passwordHash: "!integration-test-no-login",
};

const DOC_A = "integration-doc-a";
const DOC_B = "integration-doc-b";
const DOC_C = "integration-doc-c";

const PAGE_A = "integration-page-a";
const PAGE_B = "integration-page-b";
const PAGE_C = "integration-page-c";
const CHUNK_A = "integration-chunk-a";
const CHUNK_B = "integration-chunk-b";
const CHUNK_C = "integration-chunk-c";

const RATE_LIMIT_KEY = "integration:rate-limit:test";

function vectorAt(index: number): number[] {
  const vector = Array.from({ length: MODEL.dimensions }, () => 0);

  vector[index] = 1;

  return vector;
}

async function createFixtureDocument(input: {
  documentId: string;
  userId: string;
  pageId: string;
  chunkId: string;
  content: string;
  vectorIndex: number;
}): Promise<void> {
  await prisma.document.create({
    data: {
      id: input.documentId,
      userId: input.userId,
      originalFilename: `${input.documentId}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 100,
      pageCount: 1,
      pages: {
        create: [
          {
            id: input.pageId,
            pageNumber: 1,
            text: input.content,
            chunks: {
              create: [
                {
                  id: input.chunkId,
                  chunkIndex: 0,
                  content: input.content,
                  startChar: 0,
                  endChar: input.content.length,
                },
              ],
            },
          },
        ],
      },
    },
  });

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "ChunkEmbedding" (
      "id", "chunkId", "modelId", "modelRevision", "dimensions", "embedding"
    )
    VALUES (
      ${`integration-embedding-${input.chunkId}`},
      ${input.chunkId},
      ${MODEL.modelId},
      ${MODEL.modelRevision},
      ${MODEL.dimensions},
      ${formatVectorForSql(vectorAt(input.vectorIndex), MODEL.dimensions)}::vector
    )
  `);
}

beforeAll(async () => {
  await prisma.user.deleteMany({
    where: { id: { in: [USER_A.id, USER_B.id] } },
  });
  await prisma.user.createMany({
    data: [
      { ...USER_A, name: "Integration A" },
      { ...USER_B, name: "Integration B" },
    ],
  });

  await createFixtureDocument({
    documentId: DOC_A,
    userId: USER_A.id,
    pageId: PAGE_A,
    chunkId: CHUNK_A,
    content: "alpha notice period is thirty days",
    vectorIndex: 0,
  });
  await createFixtureDocument({
    documentId: DOC_B,
    userId: USER_B.id,
    pageId: PAGE_B,
    chunkId: CHUNK_B,
    content: "beta secret belongs to another user",
    vectorIndex: 1,
  });
  await createFixtureDocument({
    documentId: DOC_C,
    userId: USER_A.id,
    pageId: PAGE_C,
    chunkId: CHUNK_C,
    content: "cascade deletion fixture",
    vectorIndex: 2,
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({
    where: { id: { in: [USER_A.id, USER_B.id] } },
  });
  await prisma.rateLimitBucket.deleteMany({ where: { key: RATE_LIMIT_KEY } });
  await prisma.$disconnect();
});

describe("cross-user document access", () => {
  it("lists only the authenticated user's documents", async () => {
    const documents = await listDocumentsForUser(USER_A.id);

    expect(documents.map((document) => document.id).sort()).toEqual([
      DOC_A,
      DOC_C,
    ]);
  });

  it("reads an owned document and hides a foreign document behind not-found", async () => {
    const owned = await getDocumentDetailForUser(USER_A.id, DOC_A);
    const foreign = await getDocumentDetailForUser(USER_A.id, DOC_B);

    expect(owned?.id).toBe(DOC_A);
    expect(owned?.pages[0]?.chunks[0]?.content).toContain("alpha");
    expect(foreign).toBeNull();
  });

  it("refuses to delete a foreign document and leaves it intact", async () => {
    const deleted = await deleteDocumentForUser(USER_A.id, DOC_B);

    expect(deleted).toBe(0);
    await expect(documentExistsForUser(USER_B.id, DOC_B)).resolves.toBe(true);
  });

  it("refuses to process chunks or embeddings for a foreign document", async () => {
    await expect(
      regenerateDocumentChunks(USER_A.id, DOC_B),
    ).rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND", status: 404 });

    await expect(
      generateDocumentEmbeddings({
        userId: USER_A.id,
        documentId: DOC_B,
        options: { regenerate: false },
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND", status: 404 });
  });

  it("refuses to retrieve RAG context from a foreign document", async () => {
    await expect(
      retrieveDocumentChunks({
        userId: USER_A.id,
        documentId: DOC_B,
        question: "alpha",
        topK: 5,
      }),
    ).rejects.toMatchObject({ code: "DOCUMENT_NOT_FOUND", status: 404 });
  });

  it("lists only owned ask options and owned embedding counts", async () => {
    const options = await listAskDocumentOptions(USER_A.id, MODEL);
    const ids = options.map((option) => option.id).sort();

    expect(ids).toEqual([DOC_A, DOC_C]);
    expect(ids).not.toContain(DOC_B);
    expect(options.find((option) => option.id === DOC_A)?.embeddedChunkCount).toBe(1);
  });
});

describe("ownership inside retrieval SQL", () => {
  it("vector search never returns another user's chunks", async () => {
    const ownResults = await findNearestChunksForUser(
      vectorAt(0),
      MODEL,
      USER_A.id,
      10,
    );
    const foreignDocumentResults = await findNearestChunksForDocument(
      vectorAt(0),
      MODEL,
      DOC_B,
      USER_A.id,
      10,
    );

    expect(ownResults.map((row) => row.chunkId)).toContain(CHUNK_A);
    expect(ownResults.map((row) => row.chunkId)).not.toContain(CHUNK_B);
    expect(ownResults.every((row) => row.documentId !== DOC_B)).toBe(true);
    expect(foreignDocumentResults).toEqual([]);
  });

  it("lexical search applies the owner filter", async () => {
    const own = await searchLexicalChunks({
      userId: USER_A.id,
      documentId: DOC_A,
      query: "alpha",
      topK: 5,
    });
    const foreign = await searchLexicalChunks({
      userId: USER_A.id,
      documentId: DOC_B,
      query: "beta",
      topK: 5,
    });

    expect(own.map((hit) => hit.chunkId)).toEqual([CHUNK_A]);
    expect(foreign).toEqual([]);
  });
});

describe("limits, quotas and cascade deletion", () => {
  it("enforces the per-user document quota inside the transaction", async () => {
    await expect(
      createDocumentWithPages({
        userId: USER_A.id,
        originalFilename: "over-quota.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        pageCount: 1,
        pages: [{ pageNumber: 1, text: "content" }],
        maxDocumentsPerUser: 1,
      }),
    ).rejects.toMatchObject({
      code: "DOCUMENT_QUOTA_EXCEEDED",
      status: 429,
    });
  });

  it("rejects requests above a fixed-window limit", async () => {
    const first = await consumeRateLimit({
      key: RATE_LIMIT_KEY,
      limit: 2,
      windowSeconds: 60,
    });
    const second = await consumeRateLimit({
      key: RATE_LIMIT_KEY,
      limit: 2,
      windowSeconds: 60,
    });
    const third = await consumeRateLimit({
      key: RATE_LIMIT_KEY,
      limit: 2,
      windowSeconds: 60,
    });

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);

    await expect(
      assertRateLimit({
        key: RATE_LIMIT_KEY,
        limit: 2,
        windowSeconds: 60,
      }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", status: 429 });
  });

  it("cascades document deletion through pages, chunks and embeddings", async () => {
    const deleted = await deleteDocumentForUser(USER_A.id, DOC_C);

    expect(deleted).toBe(1);

    const [pages, chunks, embeddings] = await Promise.all([
      prisma.documentPage.count({ where: { documentId: DOC_C } }),
      prisma.documentChunk.count({ where: { id: CHUNK_C } }),
      prisma.chunkEmbedding.count({ where: { chunkId: CHUNK_C } }),
    ]);

    expect(pages).toBe(0);
    expect(chunks).toBe(0);
    expect(embeddings).toBe(0);
  });
});
