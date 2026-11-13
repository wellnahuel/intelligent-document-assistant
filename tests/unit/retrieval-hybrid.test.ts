import { beforeEach, describe, expect, it, vi } from "vitest";

const vectorSearch = vi.hoisted(() => ({
  searchVectorCandidates: vi.fn(),
}));
const lexicalSearch = vi.hoisted(() => ({
  searchLexicalChunks: vi.fn(),
}));

vi.mock("@/lib/retrieval/vector", () => vectorSearch);
vi.mock("@/lib/retrieval/lexical", () => lexicalSearch);

import { searchHybridCandidates } from "@/lib/retrieval/hybrid";
import type { HybridHit, LexicalHit, VectorHit } from "@/lib/retrieval/types";

const MODEL = {
  modelId: "test/model",
  modelRevision: "rev-1",
  dimensions: 384,
};
const vector = [0.1, 0.2, 0.3];
const documentId = "doc-demo";
const userId = "user-demo";
const query = "notice period";

function makeHit(chunkId: string, score: number): VectorHit {
  return {
    chunkId,
    documentId,
    documentName: "demo-contract.pdf",
    pageNumber: 1,
    chunkIndex: 0,
    content: `Content for ${chunkId}.`,
    score,
    distance: 1 - score,
  };
}

function makeLexicalHit(chunkId: string, lexicalScore: number): LexicalHit {
  return {
    chunkId,
    documentId,
    documentName: "demo-contract.pdf",
    pageNumber: 1,
    chunkIndex: 0,
    content: `Content for ${chunkId}.`,
    score: lexicalScore,
    lexicalScore,
  };
}

function hitAt(hits: readonly HybridHit[], index: number): HybridHit {
  const hit = hits[index];

  if (!hit) {
    throw new Error(`Expected a fused hit at index ${index}.`);
  }

  return hit;
}

beforeEach(() => {
  vi.clearAllMocks();
  vectorSearch.searchVectorCandidates.mockResolvedValue([]);
  lexicalSearch.searchLexicalChunks.mockResolvedValue([]);
});

describe("searchHybridCandidates", () => {
  it("requests max(candidates, topK) from both sources and fuses by rank", async () => {
    vectorSearch.searchVectorCandidates.mockResolvedValue([
      makeHit("chunk-a", 0.9),
      makeHit("chunk-b", 0.8),
    ]);
    lexicalSearch.searchLexicalChunks.mockResolvedValue([
      makeLexicalHit("chunk-b", 0.5),
      makeLexicalHit("chunk-c", 0.4),
    ]);

    const result = await searchHybridCandidates({
      userId,
      documentId,
      query,
      vector,
      model: MODEL,
      candidates: 10,
      rrfK: 60,
      topK: 4,
    });

    expect(vectorSearch.searchVectorCandidates).toHaveBeenCalledWith({
      userId,
      documentId,
      vector,
      model: MODEL,
      topK: 10,
    });
    expect(lexicalSearch.searchLexicalChunks).toHaveBeenCalledWith({
      userId,
      documentId,
      query,
      topK: 10,
    });

    expect(result.map((hit) => hit.chunkId)).toEqual([
      "chunk-b",
      "chunk-a",
      "chunk-c",
    ]);

    const shared = hitAt(result, 0);

    expect(shared.rrfScore).toBeCloseTo(1 / 61 + 1 / 62, 12);
    expect(shared.score).toBeCloseTo(1 / 61 + 1 / 62, 12);
    expect(shared.sourceRanks).toEqual([
      { source: "vector", rank: 2, score: 0.8 },
      { source: "lexical", rank: 1, score: 0.5 },
    ]);
  });

  it("raises the requested count when topK is larger than candidates", async () => {
    await searchHybridCandidates({
      userId,
      documentId,
      query,
      vector,
      model: MODEL,
      candidates: 5,
      rrfK: 60,
      topK: 20,
    });

    expect(vectorSearch.searchVectorCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ topK: 20 }),
    );
    expect(lexicalSearch.searchLexicalChunks).toHaveBeenCalledWith(
      expect.objectContaining({ topK: 20 }),
    );
  });

  it("still fuses vector results when the lexical query has no matches", async () => {
    vectorSearch.searchVectorCandidates.mockResolvedValue([
      makeHit("chunk-a", 0.9),
      makeHit("chunk-b", 0.8),
    ]);

    const result = await searchHybridCandidates({
      userId,
      documentId,
      query: "...",
      vector,
      model: MODEL,
      candidates: 10,
      rrfK: 60,
      topK: 2,
    });

    expect(result.map((hit) => hit.chunkId)).toEqual(["chunk-a", "chunk-b"]);
    expect(hitAt(result, 0).sourceRanks).toEqual([
      { source: "vector", rank: 1, score: 0.9 },
    ]);
  });

  it.each([0, -1, 2.5, Number.NaN])(
    "rejects invalid candidates %s without searching",
    async (candidates) => {
      await expect(
        searchHybridCandidates({
          userId,
          documentId,
          query,
          vector,
          model: MODEL,
          candidates,
          rrfK: 60,
          topK: 5,
        }),
      ).rejects.toThrow(/candidates must be a positive integer/);

      expect(vectorSearch.searchVectorCandidates).not.toHaveBeenCalled();
      expect(lexicalSearch.searchLexicalChunks).not.toHaveBeenCalled();
    },
  );

  it.each([0, -1, 2.5, Number.NaN])(
    "rejects invalid topK %s without searching",
    async (topK) => {
      await expect(
        searchHybridCandidates({
          userId,
          documentId,
          query,
          vector,
          model: MODEL,
          candidates: 10,
          rrfK: 60,
          topK,
        }),
      ).rejects.toThrow(/topK must be a positive integer/);

      expect(vectorSearch.searchVectorCandidates).not.toHaveBeenCalled();
      expect(lexicalSearch.searchLexicalChunks).not.toHaveBeenCalled();
    },
  );
});
