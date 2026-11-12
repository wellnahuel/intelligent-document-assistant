import { describe, expect, it } from "vitest";

import type { SearchConfig } from "@/lib/embeddings/config";
import {
  parseGenerationOptions,
  parseSearchQuery,
  parseSearchRequest,
  parseTopK,
} from "@/lib/embeddings/input";
import {
  createEmbeddingProvider,
  type EmbeddingExtractor,
} from "@/lib/embeddings/provider-core";
import type { EmbeddingModelInfo } from "@/lib/embeddings/types";
import {
  EMBEDDING_DIMENSIONS,
  assertEmbeddingVector,
  cosineSimilarityFromDistance,
  formatVectorForSql,
  toPassageText,
  toQueryText,
} from "@/lib/embeddings/vector";

const MODEL: EmbeddingModelInfo = {
  modelId: "test/model",
  modelRevision: "rev-1",
  dimensions: EMBEDDING_DIMENSIONS,
};

const SEARCH_CONFIG: SearchConfig = {
  defaultTopK: 5,
  maxTopK: 20,
  queryMaxChars: 1000,
};

function makeVector(value = 0.1): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, () => value);
}

function createFakeExtractor(vectors: number[][] = [makeVector()]) {
  const calls: Array<{
    texts: string[];
    options: { pooling: "mean"; normalize: true };
  }> = [];

  const extractor: EmbeddingExtractor = async (texts, options) => {
    calls.push({ texts, options });

    return { tolist: () => vectors.slice(0, texts.length) };
  };

  return { extractor, calls };
}

describe("embedding vector validation", () => {
  it("accepts exactly 384 finite numbers", () => {
    expect(() => assertEmbeddingVector(makeVector())).not.toThrow();
  });

  it("rejects a wrong dimension", () => {
    expect(() =>
      assertEmbeddingVector(makeVector().slice(0, EMBEDDING_DIMENSIONS - 1)),
    ).toThrow(/dimensions/);

    expect(() =>
      assertEmbeddingVector([...makeVector(), 0.1]),
    ).toThrow(/dimensions/);
  });

  it("rejects NaN", () => {
    const vector = makeVector();
    vector[10] = Number.NaN;

    expect(() => assertEmbeddingVector(vector)).toThrow(/non-finite/);
  });

  it("rejects Infinity and -Infinity", () => {
    const positive = makeVector();
    positive[0] = Number.POSITIVE_INFINITY;

    const negative = makeVector();
    negative[0] = Number.NEGATIVE_INFINITY;

    expect(() => assertEmbeddingVector(positive)).toThrow(/non-finite/);
    expect(() => assertEmbeddingVector(negative)).toThrow(/non-finite/);
  });
});

describe("pgvector formatting", () => {
  it("formats a validated vector as a pgvector literal", () => {
    expect(formatVectorForSql([0.1, -0.2, 0.3], 3)).toBe("[0.1,-0.2,0.3]");
  });

  it("refuses to format a vector with NaN", () => {
    expect(() => formatVectorForSql([0.1, Number.NaN], 2)).toThrow(
      /non-finite/,
    );
  });
});

describe("E5 prefixes", () => {
  it("prefixes passages and queries separately", () => {
    expect(toPassageText("texto")).toBe("passage: texto");
    expect(toQueryText("texto")).toBe("query: texto");
  });

  it("applies the prefixes through the provider", async () => {
    const { extractor, calls } = createFakeExtractor([
      makeVector(0.1),
      makeVector(0.2),
    ]);
    const provider = createEmbeddingProvider(extractor, MODEL);

    const vectors = await provider.embedPassages(["uno", "dos"]);

    expect(vectors).toHaveLength(2);
    expect(calls[0]?.texts).toEqual(["passage: uno", "passage: dos"]);
    expect(calls[0]?.options).toEqual({
      pooling: "mean",
      normalize: true,
    });

    await provider.embedQuery("  pregunta  ");

    expect(calls[1]?.texts).toEqual(["query: pregunta"]);
  });

  it("rejects a model output with the wrong dimension", async () => {
    const { extractor } = createFakeExtractor([
      makeVector().slice(0, EMBEDDING_DIMENSIONS - 1),
    ]);
    const provider = createEmbeddingProvider(extractor, MODEL);

    await expect(provider.embedPassages(["texto"])).rejects.toThrow(
      /dimensions/,
    );
  });

  it("rejects a model output with NaN", async () => {
    const vector = makeVector();
    vector[0] = Number.NaN;

    const { extractor } = createFakeExtractor([vector]);
    const provider = createEmbeddingProvider(extractor, MODEL);

    await expect(provider.embedQuery("pregunta")).rejects.toThrow(
      /non-finite/,
    );
  });
});

describe("search input validation", () => {
  it("trims a valid question", () => {
    expect(parseSearchQuery("  ¿Qué dice el contrato?  ", 1000)).toBe(
      "¿Qué dice el contrato?",
    );
  });

  it("rejects empty, non-string, and oversized questions", () => {
    expect(() => parseSearchQuery("   ", 1000)).toThrow(/Escribí/);
    expect(() => parseSearchQuery(42, 1000)).toThrow(/texto/);
    expect(() => parseSearchQuery("x".repeat(1001), 1000)).toThrow(
      /1000 caracteres/,
    );
  });

  it("uses the default topK and rejects out-of-range values", () => {
    expect(parseTopK(undefined, SEARCH_CONFIG)).toBe(5);
    expect(parseTopK(20, SEARCH_CONFIG)).toBe(20);

    expect(() => parseTopK(null, SEARCH_CONFIG)).toThrow(/entre 1 y 20/);
    expect(() => parseTopK(0, SEARCH_CONFIG)).toThrow(/entre 1 y 20/);
    expect(() => parseTopK(21, SEARCH_CONFIG)).toThrow(/entre 1 y 20/);
    expect(() => parseTopK(2.5, SEARCH_CONFIG)).toThrow(/entre 1 y 20/);
    expect(() => parseTopK("5", SEARCH_CONFIG)).toThrow(/entre 1 y 20/);
  });

  it("validates the search request body shape", () => {
    expect(parseSearchRequest({ query: "hola", topK: 3 })).toEqual({
      query: "hola",
      topK: 3,
    });

    expect(() => parseSearchRequest(null)).toThrow(/objeto JSON/);
    expect(() => parseSearchRequest([])).toThrow(/objeto JSON/);
  });

  it("defaults generation options and rejects a non-boolean regenerate", () => {
    expect(parseGenerationOptions(undefined)).toEqual({ regenerate: false });
    expect(parseGenerationOptions({})).toEqual({ regenerate: false });
    expect(parseGenerationOptions({ regenerate: true })).toEqual({
      regenerate: true,
    });

    expect(() => parseGenerationOptions({ regenerate: "yes" })).toThrow(
      /booleano/,
    );
    expect(() => parseGenerationOptions([])).toThrow(/objeto JSON/);
  });
});

describe("cosine distance and similarity", () => {
  it("converts distance to similarity", () => {
    expect(cosineSimilarityFromDistance(1)).toBe(0);
    expect(cosineSimilarityFromDistance(0.006)).toBeCloseTo(0.994, 3);
  });

  it("clamps floating-point noise and rejects non-finite input", () => {
    expect(cosineSimilarityFromDistance(-1)).toBe(1);
    expect(cosineSimilarityFromDistance(3)).toBe(-1);
    expect(() => cosineSimilarityFromDistance(Number.NaN)).toThrow(
      /finite/,
    );
  });
});
