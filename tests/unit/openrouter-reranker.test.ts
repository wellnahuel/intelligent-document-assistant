import { describe, expect, it, vi } from "vitest";

import {
  OPENROUTER_RERANK_URL,
  RerankError,
  createOpenRouterReranker,
  requestRerank,
  type FetchLike,
} from "@/lib/retrieval/openrouter-reranker";
import type { RerankCandidate } from "@/lib/retrieval/types";

const CONFIG = {
  apiKey: "test-secret-key",
  model: "test/rerank-model",
  timeoutMs: 1000,
};

const CANDIDATES: readonly RerankCandidate[] = [
  { chunkId: "chunk-a", content: "First candidate content." },
  { chunkId: "chunk-b", content: "Second candidate content." },
  { chunkId: "chunk-c", content: "Third candidate content." },
];

const QUERY = "Which notice period applies?";
const TOP_N = 2;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function rerankBody(overrides: Record<string, unknown> = {}) {
  return {
    id: "rerank-1",
    model: "provider/rerank-v2",
    results: [
      { index: 2, relevance_score: 0.2 },
      { index: 0, relevance_score: 0.95 },
      { index: 1, relevance_score: 0.7 },
    ],
    usage: {
      search_units: 3,
      total_tokens: 42,
      cost: 0.0001,
    },
    ...overrides,
  };
}

function defaultInput(fetchImpl: FetchLike) {
  return {
    config: CONFIG,
    query: QUERY,
    candidates: CANDIDATES,
    topN: TOP_N,
    fetchImpl,
  };
}

function invalidInput(overrides: {
  config?: { apiKey: string; model: string; timeoutMs: number };
  query?: string;
  candidates?: readonly RerankCandidate[];
  topN?: number;
}) {
  return {
    config: CONFIG,
    query: QUERY,
    candidates: CANDIDATES,
    topN: TOP_N,
    ...overrides,
  };
}

function failingTextResponse(error: unknown): Response {
  return {
    ok: true,
    status: 200,
    text: async () => {
      throw error;
    },
  } as unknown as Response;
}

describe("OpenRouter rerank client", () => {
  it("sends candidates and normalizes the ranked outcome", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(rerankBody()));

    const outcome = await requestRerank(defaultInput(fetchImpl));

    expect(outcome.model).toBe("provider/rerank-v2");
    expect(outcome.items).toEqual([
      { chunkId: "chunk-a", providerIndex: 0, relevanceScore: 0.95 },
      { chunkId: "chunk-b", providerIndex: 1, relevanceScore: 0.7 },
    ]);
    expect(outcome.usage).toEqual({
      searchUnits: 3,
      totalTokens: 42,
      cost: 0.0001,
    });
    expect(Number.isFinite(outcome.latencyMs)).toBe(true);
    expect(outcome.latencyMs).toBeGreaterThanOrEqual(0);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(OPENROUTER_RERANK_URL);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-secret-key",
      "Content-Type": "application/json",
      "X-Title": "Intelligent Document Assistant",
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);

    const body = JSON.parse(String(init?.body)) as unknown;
    expect(body).toEqual({
      model: "test/rerank-model",
      query: QUERY,
      documents: CANDIDATES.map((candidate) => candidate.content),
      top_n: TOP_N,
    });
  });

  it("falls back to the configured model and null usage when omitted", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ results: [{ index: 0, relevance_score: 0.5 }] }),
    );

    const outcome = await requestRerank({
      ...defaultInput(fetchImpl),
      candidates: CANDIDATES.slice(0, 1),
      topN: 1,
    });

    expect(outcome.model).toBe(CONFIG.model);
    expect(outcome.usage).toBeNull();
    expect(outcome.items).toEqual([
      { chunkId: "chunk-a", providerIndex: 0, relevanceScore: 0.5 },
    ]);
  });

  it("maps a timeout to a safe timeout error", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => {
      throw new DOMException(
        "The operation was aborted due to timeout",
        "TimeoutError",
      );
    });

    await expect(requestRerank(defaultInput(fetchImpl))).rejects.toMatchObject({
      name: "RerankError",
      kind: "timeout",
      status: null,
    });
  });

  it("maps other transport failures to a network error", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(requestRerank(defaultInput(fetchImpl))).rejects.toMatchObject({
      name: "RerankError",
      kind: "network",
      status: null,
    });
  });

  it("maps response read failures to timeout or malformed", async () => {
    const timeoutFetch = vi.fn<FetchLike>(async () =>
      failingTextResponse(new DOMException("timed out", "TimeoutError")),
    );

    await expect(
      requestRerank(defaultInput(timeoutFetch)),
    ).rejects.toMatchObject({ kind: "timeout", status: null });

    const readFailureFetch = vi.fn<FetchLike>(async () =>
      failingTextResponse(new Error("socket closed")),
    );

    await expect(
      requestRerank(defaultInput(readFailureFetch)),
    ).rejects.toMatchObject({ kind: "malformed", status: null });
  });

  it.each([429, 500])(
    "maps status %i to a safe http error without leaking input",
    async (status) => {
      const fetchImpl = vi.fn<FetchLike>(async () =>
        new Response("provider failure", { status }),
      );

      let caught: unknown;

      try {
        await requestRerank(defaultInput(fetchImpl));
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(RerankError);
      expect(caught).toMatchObject({ kind: "http", status });

      const message = (caught as Error).message;
      expect(message).not.toContain(CONFIG.apiKey);
      expect(message).not.toContain(QUERY);
      expect(message).not.toContain(CANDIDATES[0]?.content ?? "First candidate");
    },
  );

  it("rejects malformed JSON", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      new Response("not-json", { status: 200 }),
    );

    await expect(requestRerank(defaultInput(fetchImpl))).rejects.toMatchObject({
      kind: "malformed",
      status: 200,
    });
  });

  it("rejects a malformed result shape", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ results: [{ index: 0 }] }),
    );

    await expect(requestRerank(defaultInput(fetchImpl))).rejects.toMatchObject({
      kind: "malformed",
      status: 200,
    });
  });

  it("maps an error object in a 200 response to upstream", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ error: { code: 502, message: "upstream failed" } }),
    );

    await expect(requestRerank(defaultInput(fetchImpl))).rejects.toMatchObject({
      kind: "upstream",
      status: 200,
    });
  });

  it("rejects empty results from the provider as validation", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse({ results: [] }));

    await expect(requestRerank(defaultInput(fetchImpl))).rejects.toMatchObject({
      kind: "validation",
      status: 200,
    });
  });

  it("rejects out-of-range and duplicate provider indices as validation", async () => {
    const outOfRangeFetch = vi.fn<FetchLike>(async () =>
      jsonResponse({ results: [{ index: 3, relevance_score: 0.5 }] }),
    );

    await expect(
      requestRerank(defaultInput(outOfRangeFetch)),
    ).rejects.toMatchObject({ kind: "validation", status: 200 });

    const duplicateFetch = vi.fn<FetchLike>(async () =>
      jsonResponse({
        results: [
          { index: 1, relevance_score: 0.9 },
          { index: 1, relevance_score: 0.8 },
        ],
      }),
    );

    await expect(
      requestRerank(defaultInput(duplicateFetch)),
    ).rejects.toMatchObject({ kind: "validation", status: 200 });
  });

  it("rejects invalid local inputs before calling the provider", async () => {
    const fetchImpl = vi.fn<FetchLike>();
    const inputs = [
      invalidInput({ query: "   " }),
      invalidInput({ candidates: [] }),
      invalidInput({ topN: 0 }),
      invalidInput({ topN: -2 }),
      invalidInput({ topN: 1.5 }),
      invalidInput({ config: { ...CONFIG, apiKey: "" } }),
      invalidInput({ config: { ...CONFIG, model: " " } }),
      invalidInput({ config: { ...CONFIG, timeoutMs: 0 } }),
      invalidInput({ config: { ...CONFIG, timeoutMs: -1 } }),
    ];

    for (const input of inputs) {
      await expect(requestRerank({ ...input, fetchImpl })).rejects.toMatchObject(
        { name: "RerankError", kind: "validation", status: null },
      );
    }

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("createOpenRouterReranker", () => {
  it("exposes the configured model and delegates requests to the client", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => jsonResponse(rerankBody()));

    const reranker = createOpenRouterReranker(CONFIG, fetchImpl);

    expect(reranker.model).toBe(CONFIG.model);

    const outcome = await reranker.rerank({
      query: QUERY,
      candidates: CANDIDATES,
      topN: 1,
    });

    expect(outcome.items).toEqual([
      { chunkId: "chunk-a", providerIndex: 0, relevanceScore: 0.95 },
    ]);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(OPENROUTER_RERANK_URL);

    const body = JSON.parse(String(init?.body)) as {
      model: string;
      query: string;
      documents: string[];
      top_n: number;
    };
    expect(body.model).toBe(CONFIG.model);
    expect(body.query).toBe(QUERY);
    expect(body.documents).toEqual(
      CANDIDATES.map((candidate) => candidate.content),
    );
    expect(body.top_n).toBe(1);
  });
});
