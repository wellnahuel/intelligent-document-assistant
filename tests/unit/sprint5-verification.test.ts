import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ $queryRaw: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: db }));

import {
  validateDataset,
  type Fixture,
  type GoldSet,
} from "@/lib/evaluation/dataset";
import {
  precisionAtK,
  recallAtK,
  reciprocalRank,
} from "@/lib/evaluation/metrics";
import { getRetrievalConfig } from "@/lib/retrieval/config";
import { searchLexicalChunks } from "@/lib/retrieval/lexical";
import { mapRerankResults } from "@/lib/retrieval/reranker";
import { reciprocalRankFusion } from "@/lib/retrieval/rrf";
import type { RetrievalHit } from "@/lib/retrieval/types";

function hit(chunkId: string, score = 0.5): RetrievalHit {
  return {
    chunkId,
    documentId: "doc-a",
    documentName: "a.txt",
    pageNumber: 1,
    chunkIndex: 0,
    content: `content ${chunkId}`,
    score,
  };
}

const FIXTURE: Fixture = {
  documents: [
    {
      id: "doc-a",
      originalFilename: "a.txt",
      mimeType: "text/plain",
      pages: [
        {
          id: "page-a",
          pageNumber: 1,
          chunks: [
            { id: "chunk-a1", content: "alpha" },
            { id: "chunk-a2", content: "beta" },
          ],
        },
      ],
    },
    {
      id: "doc-b",
      originalFilename: "b.txt",
      mimeType: "text/plain",
      pages: [
        {
          id: "page-b",
          pageNumber: 1,
          chunks: [{ id: "chunk-b1", content: "gamma" }],
        },
      ],
    },
  ],
};

function goldSet(
  overrides: Partial<GoldSet["cases"][number]> = {},
): GoldSet {
  return {
    version: 1,
    cases: [
      {
        id: "q-01",
        question: "question",
        documentId: "doc-a",
        relevantChunkIds: ["chunk-a1"],
        answerable: true,
        ...overrides,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.$queryRaw.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("S5 metrics invariants", () => {
  it("divides Precision@k by k and returns null recall without relevant chunks", () => {
    expect(precisionAtK(["a"], ["a"], 5)).toBe(0.2);
    expect(precisionAtK(["a"], ["a", "x", "y", "z", "w"], 5)).toBe(0.2);
    expect(recallAtK([], ["a"], 5)).toBeNull();
    expect(recallAtK(["a", "b"], ["x", "a"], 5)).toBe(0.5);
  });

  it("deduplicates retrieved ids and uses the first relevant position for MRR", () => {
    expect(reciprocalRank(["b"], ["a", "a", "b"])).toBe(0.5);
    expect(reciprocalRank(["b"], ["b", "b", "b"])).toBe(1);
    expect(reciprocalRank(["b"], ["a", "c"])).toBe(0);
  });
});

describe("S8 RRF invariants", () => {
  it("counts a duplicate once per list and accumulates across lists", () => {
    const fused = reciprocalRankFusion(
      [
        { source: "vector", hits: [hit("a"), hit("b"), hit("a")] },
        { source: "lexical", hits: [hit("b"), hit("c")] },
      ],
      { k: 60, limit: 10 },
    );

    expect(fused.map((result) => result.chunkId)).toEqual(["b", "a", "c"]);
    expect(fused[0]?.rrfScore).toBeCloseTo(1 / 62 + 1 / 61, 12);
    expect(fused[1]?.rrfScore).toBeCloseTo(1 / 61, 12);
    expect(fused[1]?.sourceRanks).toEqual([
      { source: "vector", rank: 1, score: 0.5 },
    ]);
  });

  it("breaks equal-score ties deterministically by chunkId", () => {
    const fused = reciprocalRankFusion(
      [
        { source: "vector", hits: [hit("y")] },
        { source: "lexical", hits: [hit("x")] },
      ],
      { k: 60, limit: 2 },
    );

    expect(fused.map((result) => result.chunkId)).toEqual(["x", "y"]);
  });
});

describe("S7 lexical empty-query short circuit", () => {
  it("returns [] without querying the database for blank or punctuation queries", async () => {
    for (const query of ["", "   \n\t ", "...!!!", "—–🔥"]) {
      await expect(
        searchLexicalChunks({ documentId: "doc-a", query, topK: 5 }),
      ).resolves.toEqual([]);
    }

    expect(db.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("S2/S3 dataset referential integrity", () => {
  it("rejects cross-document chunk references and answerable cases without chunks", () => {
    expect(() =>
      validateDataset(FIXTURE, goldSet({ relevantChunkIds: ["chunk-b1"] })),
    ).toThrow(/from document "doc-b"/);
    expect(() =>
      validateDataset(FIXTURE, goldSet({ relevantChunkIds: [] })),
    ).toThrow(/answerable but has no relevant chunk ids/);
  });
});

describe("S9 reranker index validation", () => {
  it("rejects duplicate and out-of-range indices without leaking candidate text", () => {
    const candidates = [
      { chunkId: "c1", content: "TOPSECRET-A" },
      { chunkId: "c2", content: "TOPSECRET-B" },
    ];

    for (const results of [
      [
        { index: 1, relevanceScore: 0.9 },
        { index: 1, relevanceScore: 0.8 },
      ],
      [{ index: 2, relevanceScore: 0.9 }],
    ]) {
      let message = "";

      try {
        mapRerankResults({ candidates, results, topN: 2 });
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).toMatch(/duplicate|out-of-range/);
      expect(message).not.toContain("TOPSECRET");
    }
  });

  it("is disabled without a model and without a key", () => {
    vi.stubEnv("RERANK_MODEL", "");
    vi.stubEnv("RERANK_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    expect(getRetrievalConfig().rerank).toMatchObject({
      enabled: false,
      disabledReason: "missing_model",
    });

    vi.stubEnv("RERANK_MODEL", "test/model");
    expect(getRetrievalConfig().rerank).toMatchObject({
      enabled: false,
      disabledReason: "missing_api_key",
    });

    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    expect(getRetrievalConfig().rerank.enabled).toBe(true);
  });
});
