import { describe, expect, it } from "vitest";

import {
  RerankValidationError,
  mapRerankResults,
} from "@/lib/retrieval/reranker";
import type { RerankCandidate } from "@/lib/retrieval/types";

const CANDIDATES: readonly RerankCandidate[] = [
  { chunkId: "chunk-a", content: "SECRET-ALPHA candidate text" },
  { chunkId: "chunk-b", content: "SECRET-BETA candidate text" },
  { chunkId: "chunk-c", content: "SECRET-GAMMA candidate text" },
];

function captureValidationError(run: () => unknown): RerankValidationError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(RerankValidationError);
    return error as RerankValidationError;
  }

  throw new Error("Expected mapRerankResults to throw a RerankValidationError");
}

describe("mapRerankResults", () => {
  it("sorts by relevance descending, breaks ties by provider index and takes topN", () => {
    const items = mapRerankResults({
      candidates: CANDIDATES,
      results: [
        { index: 2, relevanceScore: 0.4 },
        { index: 0, relevanceScore: 0.9 },
        { index: 1, relevanceScore: 0.9 },
      ],
      topN: 2,
    });

    expect(items).toEqual([
      { chunkId: "chunk-a", providerIndex: 0, relevanceScore: 0.9 },
      { chunkId: "chunk-b", providerIndex: 1, relevanceScore: 0.9 },
    ]);
  });

  it("maps every result when topN reaches beyond the returned results", () => {
    const items = mapRerankResults({
      candidates: CANDIDATES,
      results: [
        { index: 2, relevanceScore: 0.2 },
        { index: 0, relevanceScore: 0.8 },
      ],
      topN: 5,
    });

    expect(items).toEqual([
      { chunkId: "chunk-a", providerIndex: 0, relevanceScore: 0.8 },
      { chunkId: "chunk-c", providerIndex: 2, relevanceScore: 0.2 },
    ]);
  });

  it("rejects empty candidates", () => {
    const error = captureValidationError(() =>
      mapRerankResults({
        candidates: [],
        results: [{ index: 0, relevanceScore: 1 }],
        topN: 1,
      }),
    );

    expect(error.message).not.toContain("SECRET");
  });

  it("rejects a topN that is not a positive integer", () => {
    for (const topN of [0, -1, 1.5]) {
      const error = captureValidationError(() =>
        mapRerankResults({
          candidates: CANDIDATES,
          results: [{ index: 0, relevanceScore: 1 }],
          topN,
        }),
      );

      expect(error.message).not.toContain("SECRET");
    }
  });

  it("rejects empty results when candidates exist", () => {
    const error = captureValidationError(() =>
      mapRerankResults({
        candidates: CANDIDATES,
        results: [],
        topN: 1,
      }),
    );

    expect(error.message).not.toContain("SECRET");
  });

  it("rejects more results than candidates", () => {
    const error = captureValidationError(() =>
      mapRerankResults({
        candidates: CANDIDATES,
        results: [
          { index: 0, relevanceScore: 0.9 },
          { index: 1, relevanceScore: 0.8 },
          { index: 2, relevanceScore: 0.7 },
          { index: 0, relevanceScore: 0.6 },
        ],
        topN: 3,
      }),
    );

    expect(error.message).not.toContain("SECRET");
  });

  it("rejects out-of-range indices", () => {
    for (const index of [-1, 3]) {
      const error = captureValidationError(() =>
        mapRerankResults({
          candidates: CANDIDATES,
          results: [{ index, relevanceScore: 0.5 }],
          topN: 1,
        }),
      );

      expect(error.message).not.toContain("SECRET");
    }
  });

  it("rejects duplicate indices", () => {
    const error = captureValidationError(() =>
      mapRerankResults({
        candidates: CANDIDATES,
        results: [
          { index: 1, relevanceScore: 0.9 },
          { index: 1, relevanceScore: 0.8 },
        ],
        topN: 2,
      }),
    );

    expect(error.message).not.toContain("SECRET");
  });

  it("rejects non-integer indices", () => {
    for (const index of [0.5, Number.NaN]) {
      const error = captureValidationError(() =>
        mapRerankResults({
          candidates: CANDIDATES,
          results: [{ index, relevanceScore: 0.5 }],
          topN: 1,
        }),
      );

      expect(error.message).not.toContain("SECRET");
    }
  });

  it("rejects non-finite relevance scores", () => {
    for (const relevanceScore of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const error = captureValidationError(() =>
        mapRerankResults({
          candidates: CANDIDATES,
          results: [{ index: 0, relevanceScore }],
          topN: 1,
        }),
      );

      expect(error.message).not.toContain("SECRET");
    }
  });
});
