import { describe, expect, it } from "vitest";

import {
  computeRetrievalMetrics,
  dedupeChunkIds,
  mean,
  precisionAtK,
  recallAtK,
  reciprocalRank,
} from "@/lib/evaluation/metrics";

const RELEVANT = ["chunk-12", "chunk-13"];
const RETRIEVED = [
  "chunk-7",
  "chunk-12",
  "chunk-18",
  "chunk-13",
  "chunk-2",
];

describe("retrieval metrics", () => {
  it("computes Recall@k, Precision@k and MRR for known rankings", () => {
    const metrics = computeRetrievalMetrics(RELEVANT, RETRIEVED, 5);

    expect(metrics.recallAtK).toBe(1);
    expect(metrics.precisionAtK).toBe(0.4);
    expect(metrics.reciprocalRank).toBe(0.5);
  });

  it("uses k as the precision denominator even when fewer items were returned", () => {
    expect(precisionAtK(["a"], ["a"], 5)).toBe(0.2);
    expect(recallAtK(["a"], ["a"], 5)).toBe(1);
  });

  it("counts only relevant chunks inside the first k positions for recall", () => {
    expect(recallAtK(RELEVANT, RETRIEVED, 2)).toBe(0.5);
    expect(precisionAtK(RELEVANT, RETRIEVED, 2)).toBe(0.5);
  });

  it("returns a null recall and zero precision/MRR when there are no relevant chunks", () => {
    const metrics = computeRetrievalMetrics([], RETRIEVED, 5);

    expect(metrics.recallAtK).toBeNull();
    expect(metrics.precisionAtK).toBe(0);
    expect(metrics.reciprocalRank).toBe(0);
  });

  it("deduplicates retrieved ids before computing the rank", () => {
    expect(dedupeChunkIds(["a", "a", "b", "a"])).toEqual(["a", "b"]);
    expect(reciprocalRank(["b"], ["a", "a", "b"])).toBe(0.5);
    expect(precisionAtK(["b"], ["a", "a", "b"], 5)).toBe(0.2);
  });

  it("rewards moving a relevant chunk to the first position", () => {
    expect(reciprocalRank(["b"], ["a", "b", "c"])).toBe(0.5);
    expect(reciprocalRank(["b"], ["b", "a", "c"])).toBe(1);
    expect(reciprocalRank(["b"], ["a", "c", "d"])).toBe(0);
  });

  it("aggregates means and ignores empty samples", () => {
    expect(mean([1, 0.5, 0])).toBe(0.5);
    expect(mean([])).toBeNull();
  });

  it("rejects an invalid k", () => {
    expect(() => recallAtK(RELEVANT, RETRIEVED, 0)).toThrow(
      /positive integer/,
    );
    expect(() => precisionAtK(RELEVANT, RETRIEVED, 1.5)).toThrow(
      /positive integer/,
    );
  });
});
