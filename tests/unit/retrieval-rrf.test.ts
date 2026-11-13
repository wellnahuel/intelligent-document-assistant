import { describe, expect, it } from "vitest";

import {
  reciprocalRankFusion,
  type RankedList,
} from "@/lib/retrieval/rrf";
import type { RetrievalHit } from "@/lib/retrieval/types";

function makeHit(
  chunkId: string,
  score: number,
  overrides: Partial<RetrievalHit> = {},
): RetrievalHit {
  return {
    chunkId,
    documentId: "doc-demo",
    documentName: "demo-contract.pdf",
    pageNumber: 1,
    chunkIndex: 0,
    content: `Content for ${chunkId}.`,
    score,
    ...overrides,
  };
}

function firstHit<T extends RetrievalHit>(hits: readonly T[]): T {
  const hit = hits[0];

  if (!hit) {
    throw new Error("Expected at least one fused hit.");
  }

  return hit;
}

describe("reciprocalRankFusion", () => {
  it("accumulates both contributions for a chunk present in both lists", () => {
    const lists: RankedList[] = [
      {
        source: "vector",
        hits: [makeHit("chunk-a", 0.9), makeHit("chunk-b", 0.8)],
      },
      {
        source: "lexical",
        hits: [makeHit("chunk-a", 0.5), makeHit("chunk-c", 0.4)],
      },
    ];

    const result = reciprocalRankFusion(lists, { k: 60, limit: 3 });

    expect(result.map((hit) => hit.chunkId)).toEqual([
      "chunk-a",
      "chunk-b",
      "chunk-c",
    ]);

    const shared = firstHit(result);

    expect(shared.rrfScore).toBeCloseTo(2 / 61, 12);
    expect(shared.score).toBeCloseTo(2 / 61, 12);
    expect(shared.sourceRanks).toEqual([
      { source: "vector", rank: 1, score: 0.9 },
      { source: "lexical", rank: 1, score: 0.5 },
    ]);

    expect(result[1]?.rrfScore).toBeCloseTo(1 / 62, 12);
    expect(result[1]?.sourceRanks).toHaveLength(1);
    expect(result[2]?.rrfScore).toBeCloseTo(1 / 62, 12);
  });

  it("keeps sourceRanks in the order the caller passed the lists", () => {
    const shared = makeHit("chunk-shared", 0.7);

    const result = reciprocalRankFusion(
      [
        { source: "lexical", hits: [shared] },
        { source: "vector", hits: [shared] },
      ],
      { k: 60, limit: 1 },
    );

    expect(firstHit(result).sourceRanks.map((entry) => entry.source)).toEqual([
      "lexical",
      "vector",
    ]);
  });

  it("counts a duplicate chunk inside one list only once", () => {
    const result = reciprocalRankFusion(
      [
        {
          source: "vector",
          hits: [
            makeHit("chunk-x", 0.3),
            makeHit("chunk-x", 0.2),
            makeHit("chunk-y", 0.1),
          ],
        },
      ],
      { k: 60, limit: 10 },
    );

    expect(result.map((hit) => hit.chunkId)).toEqual(["chunk-x", "chunk-y"]);

    const duplicate = firstHit(result);

    expect(duplicate.rrfScore).toBeCloseTo(1 / 61, 12);
    expect(duplicate.sourceRanks).toEqual([
      { source: "vector", rank: 1, score: 0.3 },
    ]);
    expect(result[1]?.rrfScore).toBeCloseTo(1 / 62, 12);
  });

  it("applies the limit and breaks ties by chunkId", () => {
    const lists: RankedList[] = [
      { source: "vector", hits: [makeHit("chunk-b", 0.9)] },
      { source: "lexical", hits: [makeHit("chunk-a", 0.8)] },
    ];

    const full = reciprocalRankFusion(lists, { k: 60, limit: 10 });

    expect(full.map((hit) => hit.chunkId)).toEqual(["chunk-a", "chunk-b"]);

    const limited = reciprocalRankFusion(lists, { k: 60, limit: 1 });

    expect(limited.map((hit) => hit.chunkId)).toEqual(["chunk-a"]);
  });

  it("returns an empty list for empty input", () => {
    expect(reciprocalRankFusion([], { k: 60, limit: 5 })).toEqual([]);
  });

  const conflicts: Array<[string, Partial<RetrievalHit>]> = [
    ["content", { content: "A different body." }],
    ["documentId", { documentId: "doc-other" }],
    ["pageNumber", { pageNumber: 2 }],
  ];

  it.each(conflicts)(
    "throws when the same chunk id has a different %s",
    (_field, overrides) => {
      expect(() =>
        reciprocalRankFusion(
          [
            { source: "vector", hits: [makeHit("chunk-shared", 0.5)] },
            {
              source: "lexical",
              hits: [makeHit("chunk-shared", 0.4, overrides)],
            },
          ],
          { k: 60, limit: 5 },
        ),
      ).toThrow(/Conflicting metadata for chunk "chunk-shared"/);
    },
  );

  it.each([0, -1, 1.5, Number.NaN])("rejects invalid k %s", (k) => {
    expect(() => reciprocalRankFusion([], { k, limit: 5 })).toThrow(
      /k must be a positive integer/,
    );
  });

  it.each([0, -1, 2.5, Number.NaN])("rejects invalid limit %s", (limit) => {
    expect(() => reciprocalRankFusion([], { k: 60, limit })).toThrow(
      /limit must be a positive integer/,
    );
  });
});
