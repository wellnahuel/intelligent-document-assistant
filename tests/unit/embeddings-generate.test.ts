import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listDocumentChunks: vi.fn(),
  documentExistsForUser: vi.fn(),
  findExistingChunkIds: vi.fn(),
  upsertEmbeddingBatch: vi.fn(),
  countDocumentEmbeddings: vi.fn(),
  loadEmbeddingProviderOrThrow: vi.fn(),
}));

vi.mock("@/lib/embeddings/store", () => ({
  listDocumentChunks: mocks.listDocumentChunks,
  documentExistsForUser: mocks.documentExistsForUser,
  findExistingChunkIds: mocks.findExistingChunkIds,
  upsertEmbeddingBatch: mocks.upsertEmbeddingBatch,
  countDocumentEmbeddings: mocks.countDocumentEmbeddings,
}));

vi.mock("@/lib/embeddings/load-provider", () => ({
  loadEmbeddingProviderOrThrow: mocks.loadEmbeddingProviderOrThrow,
}));

import { generateDocumentEmbeddings } from "@/lib/embeddings/generate";
import { AppError } from "@/lib/errors";

const MODEL = {
  modelId: "Xenova/multilingual-e5-small",
  modelRevision: "761b726dd34fb83930e26aab4e9ac3899aa1fa78",
  dimensions: 384,
};
const vector = Array.from({ length: 384 }, () => 0.1);
const chunks = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: `c${index}`,
    content: `texto ${index}`,
    chunkIndex: index,
    pageNumber: 1,
  }));

function provider(embedPassages: ReturnType<typeof vi.fn>) {
  return { model: MODEL, embedPassages, embedQuery: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.EMBEDDING_BATCH_SIZE = "2";
  delete process.env.EMBEDDING_MODEL_ID;
  delete process.env.EMBEDDING_MODEL_REVISION;
  mocks.documentExistsForUser.mockResolvedValue(true);
  mocks.findExistingChunkIds.mockResolvedValue(new Set());
  mocks.upsertEmbeddingBatch.mockResolvedValue(undefined);
  mocks.countDocumentEmbeddings.mockResolvedValue(0);
});

describe("idempotent generation orchestration", () => {
  it("skips compatible rows, does not load the model, and reports complete", async () => {
    mocks.listDocumentChunks.mockResolvedValue(chunks(2));
    mocks.findExistingChunkIds.mockResolvedValue(new Set(["c0", "c1"]));
    mocks.countDocumentEmbeddings.mockResolvedValue(2);

    const result = await generateDocumentEmbeddings({ userId: "user-1", documentId: "doc1", options: { regenerate: false } });

    expect(result).toMatchObject({
      documentId: "doc1",
      chunkCount: 2,
      embeddedChunkCount: 2,
      generatedCount: 0,
      skippedCount: 2,
      failedCount: 0,
      status: "complete",
      errors: [],
    });
    expect(mocks.findExistingChunkIds).toHaveBeenCalledWith(
      "user-1",
      ["c0", "c1"],
      expect.objectContaining({ dimensions: 384 }),
    );
    expect(mocks.upsertEmbeddingBatch).not.toHaveBeenCalled();
    expect(mocks.loadEmbeddingProviderOrThrow).not.toHaveBeenCalled();
  });

  it("regenerates every chunk only when regenerate=true", async () => {
    mocks.listDocumentChunks.mockResolvedValue(chunks(2));
    const embedPassages = vi.fn().mockResolvedValue([vector, vector]);
    mocks.loadEmbeddingProviderOrThrow.mockResolvedValue(
      provider(embedPassages),
    );
    mocks.countDocumentEmbeddings.mockResolvedValue(2);

    const result = await generateDocumentEmbeddings({ userId: "user-1", documentId: "doc1", options: { regenerate: true } });

    expect(mocks.findExistingChunkIds).not.toHaveBeenCalled();
    expect(embedPassages).toHaveBeenCalledTimes(1);
    expect(mocks.upsertEmbeddingBatch).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      generatedCount: 2,
      skippedCount: 0,
      failedCount: 0,
      status: "complete",
    });
  });

  it("reports partial and counts the failed batch when inference fails in one batch", async () => {
    mocks.listDocumentChunks.mockResolvedValue(chunks(4));
    const embedPassages = vi
      .fn()
      .mockResolvedValueOnce([vector, vector])
      .mockRejectedValueOnce(new Error("onnx boom"));
    mocks.loadEmbeddingProviderOrThrow.mockResolvedValue(
      provider(embedPassages),
    );
    mocks.countDocumentEmbeddings.mockResolvedValue(2);

    const result = await generateDocumentEmbeddings({ userId: "user-1", documentId: "doc1", options: { regenerate: false } });

    expect(result.status).toBe("partial");
    expect(result.status).not.toBe("complete");
    expect(result).toMatchObject({
      chunkCount: 4,
      embeddedChunkCount: 2,
      generatedCount: 2,
      skippedCount: 0,
      failedCount: 2,
    });
    expect(result.errors).toEqual([
      expect.objectContaining({ batch: 2, stage: "embedding" }),
    ]);
    expect(mocks.upsertEmbeddingBatch).toHaveBeenCalledTimes(1);
  });

  it("reports partial and the persistence stage when one batch cannot be stored", async () => {
    mocks.listDocumentChunks.mockResolvedValue(chunks(4));
    const embedPassages = vi.fn().mockResolvedValue([vector, vector]);
    mocks.loadEmbeddingProviderOrThrow.mockResolvedValue(
      provider(embedPassages),
    );
    mocks.upsertEmbeddingBatch
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("db boom"));
    mocks.countDocumentEmbeddings.mockResolvedValue(2);

    const result = await generateDocumentEmbeddings({ userId: "user-1", documentId: "doc1", options: { regenerate: false } });

    expect(result.status).toBe("partial");
    expect(result).toMatchObject({ generatedCount: 2, failedCount: 2 });
    expect(result.errors).toEqual([
      expect.objectContaining({ batch: 2, stage: "persistence" }),
    ]);
  });

  it("reports failed, not complete, when every batch fails", async () => {
    mocks.listDocumentChunks.mockResolvedValue(chunks(2));
    const embedPassages = vi.fn().mockRejectedValue(new Error("onnx boom"));
    mocks.loadEmbeddingProviderOrThrow.mockResolvedValue(
      provider(embedPassages),
    );
    mocks.countDocumentEmbeddings.mockResolvedValue(0);

    const result = await generateDocumentEmbeddings({ userId: "user-1", documentId: "doc1", options: { regenerate: false } });

    expect(result.status).toBe("failed");
    expect(result.status).not.toBe("complete");
    expect(result).toMatchObject({ generatedCount: 0, failedCount: 2 });
  });

  it("fails clearly when the document has no chunks", async () => {
    mocks.listDocumentChunks.mockResolvedValue([]);
    mocks.documentExistsForUser.mockResolvedValue(true);

    await expect(
      generateDocumentEmbeddings({ userId: "user-1", documentId: "doc1", options: { regenerate: false } }),
    ).rejects.toMatchObject({
      code: "DOCUMENT_WITHOUT_CHUNKS",
      status: 409,
    });

    await expect(
      generateDocumentEmbeddings({ userId: "user-1", documentId: "doc1", options: { regenerate: false } }),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("distinguishes a missing document from a document without chunks", async () => {
    mocks.listDocumentChunks.mockResolvedValue([]);
    mocks.documentExistsForUser.mockResolvedValue(false);

    await expect(
      generateDocumentEmbeddings({ userId: "user-1", documentId: "doc1", options: { regenerate: false } }),
    ).rejects.toMatchObject({
      code: "DOCUMENT_NOT_FOUND",
      status: 404,
    });
  });
});
