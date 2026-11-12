import { describe, expect, it } from "vitest";

import type { SearchConfig } from "@/lib/embeddings/config";
import {
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
  formatVectorForSql,
  toPassageText,
  toQueryText,
} from "@/lib/embeddings/vector";
import { AppError } from "@/lib/errors";

const MODEL: EmbeddingModelInfo = {
  modelId: "test/model",
  modelRevision: "rev-1",
  dimensions: EMBEDDING_DIMENSIONS,
};
const SEARCH: SearchConfig = {
  defaultTopK: 5,
  maxTopK: 20,
  queryMaxChars: 1000,
};
const makeVector = (value = 0.1) =>
  Array.from({ length: EMBEDDING_DIMENSIONS }, () => value);

function expectAppError(
  fn: () => unknown,
  code: string,
  status: number,
  message: RegExp,
) {
  try {
    fn();
    throw new Error("expected AppError");
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    const appError = error as AppError;
    expect(appError.code).toBe(code);
    expect(appError.status).toBe(status);
    expect(appError.message).toMatch(message);
  }
}

describe("S6/S7 query and topK boundaries", () => {
  it("accepts exactly the maximum length after trimming", () => {
    expect(parseSearchQuery("x".repeat(1000), 1000)).toHaveLength(1000);
    expect(parseSearchQuery(`  ${"x".repeat(1000)}  `, 1000)).toHaveLength(
      1000,
    );
  });

  it("rejects empty, whitespace, non-string, and max+1 queries", () => {
    expectAppError(
      () => parseSearchQuery("", 1000),
      "INVALID_SEARCH_QUERY",
      400,
      /Escribí/,
    );
    expectAppError(
      () => parseSearchQuery("   \n\t ", 1000),
      "INVALID_SEARCH_QUERY",
      400,
      /Escribí/,
    );
    expectAppError(
      () => parseSearchQuery("x".repeat(1001), 1000),
      "INVALID_SEARCH_QUERY",
      400,
      /1000 caracteres/,
    );

    for (const value of [undefined, null, 42, true, {}, [], ["x"]]) {
      expectAppError(
        () => parseSearchQuery(value, 1000),
        "INVALID_SEARCH_QUERY",
        400,
        /texto/,
      );
    }
  });

  it("accepts topK 1..max and rejects out-of-range or non-integer values", () => {
    expect(parseTopK(1, SEARCH)).toBe(1);
    expect(parseTopK(20, SEARCH)).toBe(20);

    for (const value of [
      0,
      21,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      "5",
      true,
      {},
      null,
    ]) {
      expectAppError(
        () => parseTopK(value, SEARCH),
        "INVALID_TOP_K",
        400,
        /entero entre 1 y 20/,
      );
    }
  });

  it("rejects non-object search bodies", () => {
    for (const value of [null, undefined, [], "hola", 42, true]) {
      expectAppError(
        () => parseSearchRequest(value),
        "INVALID_REQUEST_BODY",
        400,
        /objeto JSON/,
      );
    }
    expect(parseSearchRequest({})).toEqual({
      query: undefined,
      topK: undefined,
    });
  });
});

describe("S4 vector validation", () => {
  it("accepts exactly 384 finite numbers and rejects wrong dimensions/non-finite values", () => {
    expect(() => assertEmbeddingVector(makeVector())).not.toThrow();
    expect(() => assertEmbeddingVector(makeVector().slice(0, 383))).toThrow(
      /expected 384/,
    );
    expect(() => assertEmbeddingVector([...makeVector(), 0])).toThrow(
      /expected 384/,
    );

    for (const bad of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      const vector = makeVector();
      vector[383] = bad;
      expect(() => assertEmbeddingVector(vector)).toThrow(/non-finite/);
    }

    expect(() => assertEmbeddingVector(null as never)).toThrow(/array/);
    expect(() => assertEmbeddingVector("x" as never)).toThrow(/array/);
  });

  it("formats pgvector literals and refuses invalid vectors", () => {
    expect(formatVectorForSql([0.1, -0.2, 0.3], 3)).toBe("[0.1,-0.2,0.3]");
    expect(formatVectorForSql([], 0)).toBe("[]");
    expect(() => formatVectorForSql([0.1, Number.NaN], 2)).toThrow(
      /non-finite/,
    );
    expect(() => formatVectorForSql([0.1], 2)).toThrow(/expected 2/);
  });
});

describe("S2 prefix/pooling contract", () => {
  function fake(
    vectors: number[][],
    seen: Array<{ texts: string[]; options: unknown }>,
  ): EmbeddingExtractor {
    return async (texts, options) => {
      seen.push({ texts, options });
      return { tolist: () => vectors.slice(0, texts.length) };
    };
  }

  it("applies passage/query prefixes with mean pooling and normalization", async () => {
    const seen: Array<{ texts: string[]; options: unknown }> = [];
    const provider = createEmbeddingProvider(
      fake([makeVector(0.1), makeVector(0.2)], seen),
      MODEL,
    );

    await provider.embedPassages(["uno", "dos"]);
    expect(seen[0]?.texts).toEqual(["passage: uno", "passage: dos"]);
    expect(seen[0]?.options).toEqual({ pooling: "mean", normalize: true });

    await provider.embedQuery("  pregunta  ");
    expect(seen[1]?.texts).toEqual(["query: pregunta"]);
    expect(seen[1]?.options).toEqual({ pooling: "mean", normalize: true });

    expect(toPassageText("texto")).toBe("passage: texto");
    expect(toQueryText("texto")).toBe("query: texto");
  });

  it("skips the extractor for an empty batch and rejects empty inputs", async () => {
    const seen: Array<{ texts: string[]; options: unknown }> = [];
    const provider = createEmbeddingProvider(fake([], seen), MODEL);

    await expect(provider.embedPassages([])).resolves.toEqual([]);
    expect(seen).toHaveLength(0);
    await expect(provider.embedPassages([""])).rejects.toThrow(
      /empty passage/,
    );
    await expect(provider.embedQuery("   ")).rejects.toThrow(/empty query/);
  });

  it("rejects wrong output counts, dimensions and NaN from the extractor", async () => {
    const tooFew = createEmbeddingProvider(fake([makeVector()], []), MODEL);
    await expect(tooFew.embedPassages(["a", "b"])).rejects.toThrow(
      /unexpected number/,
    );

    const wrong = createEmbeddingProvider(
      fake([makeVector().slice(0, 383)], []),
      MODEL,
    );
    await expect(wrong.embedPassages(["a"])).rejects.toThrow(/dimensions/);

    const nan = makeVector();
    nan[0] = Number.NaN;
    const nonFinite = createEmbeddingProvider(fake([nan], []), MODEL);
    await expect(nonFinite.embedQuery("q")).rejects.toThrow(/non-finite/);
  });
});

describe("new AppError codes map to coherent HTTP statuses", () => {
  it("maps validation, conflict, unavailable and query failures", () => {
    const cases: Array<[ConstructorParameters<typeof AppError>[0], number]> = [
      ["INVALID_REQUEST_BODY", 400],
      ["INVALID_SEARCH_QUERY", 400],
      ["INVALID_TOP_K", 400],
      ["DOCUMENT_WITHOUT_CHUNKS", 409],
      ["EMBEDDING_MODEL_UNAVAILABLE", 503],
      ["EMBEDDING_QUERY_FAILED", 500],
    ];

    for (const [code, status] of cases) {
      expect(new AppError(code, "message").status).toBe(status);
    }
  });
});
