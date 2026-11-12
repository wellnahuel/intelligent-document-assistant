import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  findNearestChunksForDocument: vi.fn(),
}));

vi.mock("@/lib/embeddings/store", () => store);

import { searchVectorCandidates } from "@/lib/retrieval/vector";

const MODEL = {
  modelId: "test/model",
  modelRevision: "rev-1",
  dimensions: 384,
};
const vector = [0.1, 0.2, 0.3];
const documentId = "doc-demo";

const ROW = {
  chunkId: "chunk-7",
  content: "The contract requires thirty days of written notice.",
  chunkIndex: 3,
  pageNumber: 2,
  documentId,
  documentName: "demo-contract.pdf",
  distance: "0.25",
};

beforeEach(() => {
  vi.clearAllMocks();
  store.findNearestChunksForDocument.mockResolvedValue([]);
});

describe("searchVectorCandidates", () => {
  it("delegates to the document-scoped search and maps distance to score", async () => {
    store.findNearestChunksForDocument.mockResolvedValue([ROW]);

    const result = await searchVectorCandidates({
      documentId,
      vector,
      model: MODEL,
      topK: 5,
    });

    expect(store.findNearestChunksForDocument).toHaveBeenCalledWith(
      vector,
      MODEL,
      documentId,
      5,
    );

    expect(result).toEqual([
      {
        chunkId: ROW.chunkId,
        content: ROW.content,
        chunkIndex: ROW.chunkIndex,
        pageNumber: ROW.pageNumber,
        documentId: ROW.documentId,
        documentName: ROW.documentName,
        distance: 0.25,
        score: 0.75,
      },
    ]);
  });

  it("clamps cosine similarity to the valid cosine range", async () => {
    store.findNearestChunksForDocument.mockResolvedValue([
      { ...ROW, chunkId: "chunk-far", distance: "3" },
      { ...ROW, chunkId: "chunk-near", distance: "-0.5" },
    ]);

    const result = await searchVectorCandidates({
      documentId,
      vector,
      model: MODEL,
      topK: 2,
    });

    expect(result[0]?.distance).toBe(3);
    expect(result[0]?.score).toBe(-1);
    expect(result[1]?.distance).toBe(-0.5);
    expect(result[1]?.score).toBe(1);
  });

  it.each([0, -1, 2.5, Number.NaN])(
    "rejects invalid topK %s without searching",
    async (topK) => {
      await expect(
        searchVectorCandidates({ documentId, vector, model: MODEL, topK }),
      ).rejects.toThrow(/topK must be a positive integer/);

      expect(store.findNearestChunksForDocument).not.toHaveBeenCalled();
    },
  );

  it.each(["Infinity", "NaN"])(
    "rejects a non-finite distance %s",
    async (distance) => {
      store.findNearestChunksForDocument.mockResolvedValue([
        { ...ROW, distance },
      ]);

      await expect(
        searchVectorCandidates({
          documentId,
          vector,
          model: MODEL,
          topK: 5,
        }),
      ).rejects.toThrow(/non-finite cosine distance/);
    },
  );
});
