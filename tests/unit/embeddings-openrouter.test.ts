import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getEmbeddingConfig,
  getEmbeddingModelInfo,
} from "@/lib/embeddings/config";
import {
  OPENROUTER_EMBEDDINGS_URL,
  OpenRouterEmbeddingError,
  createOpenRouterEmbeddingProvider,
  requestEmbeddings,
} from "@/lib/embeddings/openrouter-embeddings";
import { EMBEDDING_DIMENSIONS } from "@/lib/embeddings/vector";

function makeVector(value = 0.1): number[] {
  return Array.from({ length: EMBEDDING_DIMENSIONS }, () => value);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function embeddingsResponse(count = 1) {
  return {
    data: Array.from({ length: count }, (_, index) => ({
      index,
      embedding: makeVector(0.1 + index / 100),
    })),
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("embedding provider configuration", () => {
  it("defaults to the local provider and model", () => {
    vi.stubEnv("EMBEDDING_PROVIDER", undefined);
    vi.stubEnv("EMBEDDING_MODEL_ID", undefined);

    const config = getEmbeddingConfig();

    expect(config.provider).toBe("local");
    expect(config.modelId).toBe("Xenova/multilingual-e5-small");
    expect(config.dimensions).toBe(EMBEDDING_DIMENSIONS);
  });

  it("requires an explicit model when the remote provider is selected", () => {
    vi.stubEnv("EMBEDDING_PROVIDER", "openrouter");
    vi.stubEnv("EMBEDDING_MODEL_ID", undefined);

    expect(() => getEmbeddingConfig()).toThrow(/EMBEDDING_MODEL_ID/);
  });

  it("reads the remote model and stores a revision label", () => {
    vi.stubEnv("EMBEDDING_PROVIDER", "openrouter");
    vi.stubEnv("EMBEDDING_MODEL_ID", "openai/text-embedding-3-small");
    vi.stubEnv("EMBEDDING_MODEL_REVISION", undefined);

    const config = getEmbeddingConfig();

    expect(config.provider).toBe("openrouter");
    expect(config.modelId).toBe("openai/text-embedding-3-small");
    expect(config.modelRevision).toBe("openrouter-managed");
    expect(getEmbeddingModelInfo(config)).toEqual({
      modelId: "openai/text-embedding-3-small",
      modelRevision: "openrouter-managed",
      dimensions: EMBEDDING_DIMENSIONS,
    });
  });

  it("honors an explicit remote revision label", () => {
    vi.stubEnv("EMBEDDING_PROVIDER", "openrouter");
    vi.stubEnv("EMBEDDING_MODEL_ID", "openai/text-embedding-3-small");
    vi.stubEnv("EMBEDDING_MODEL_REVISION", "2026-11-provider-model");

    expect(getEmbeddingConfig().modelRevision).toBe("2026-11-provider-model");
  });

  it("falls back to local for an unknown provider value", () => {
    vi.stubEnv("EMBEDDING_PROVIDER", "bogus");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(getEmbeddingConfig().provider).toBe("local");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("EMBEDDING_PROVIDER"),
    );
  });

  it("reads the remote request timeout", () => {
    vi.stubEnv("EMBEDDING_PROVIDER", "openrouter");
    vi.stubEnv("EMBEDDING_MODEL_ID", "openai/text-embedding-3-small");
    vi.stubEnv("OPENROUTER_EMBEDDING_TIMEOUT_MS", "15000");

    expect(getEmbeddingConfig().requestTimeoutMs).toBe(15000);
  });
});

describe("requestEmbeddings", () => {
  it("posts the model, inputs and fixed dimension to the embeddings endpoint", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(embeddingsResponse(2)));

    const vectors = await requestEmbeddings({
      apiKey: "test-key",
      model: "openai/text-embedding-3-small",
      texts: ["uno", "dos"],
      timeoutMs: 5000,
      fetchImpl,
    });

    expect(vectors).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(OPENROUTER_EMBEDDINGS_URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-key",
    );
    expect(JSON.parse(String(init.body))).toEqual({
      model: "openai/text-embedding-3-small",
      input: ["uno", "dos"],
      dimensions: EMBEDDING_DIMENSIONS,
    });
  });

  it("orders vectors by the provider index when present", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [
          { index: 1, embedding: makeVector(0.2) },
          { index: 0, embedding: makeVector(0.1) },
        ],
      }),
    );

    const vectors = await requestEmbeddings({
      apiKey: "test-key",
      model: "test/model",
      texts: ["a", "b"],
      timeoutMs: 5000,
      fetchImpl,
    });

    expect(vectors[0]?.[0]).toBeCloseTo(0.1);
    expect(vectors[1]?.[0]).toBeCloseTo(0.2);
  });

  it("rejects a different number of vectors", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(embeddingsResponse(1)));

    await expect(
      requestEmbeddings({
        apiKey: "test-key",
        model: "test/model",
        texts: ["a", "b"],
        timeoutMs: 5000,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ kind: "malformed" });
  });

  it("rejects a vector with the wrong dimension", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: [{ embedding: [0.1, 0.2] }] }),
    );

    await expect(
      requestEmbeddings({
        apiKey: "test-key",
        model: "test/model",
        texts: ["a"],
        timeoutMs: 5000,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ kind: "dimension" });
  });

  it("rejects a payload that is not an array of finite numbers", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        data: [
          {
            embedding: Array.from(
              { length: EMBEDDING_DIMENSIONS },
              () => null,
            ),
          },
        ],
      }),
    );

    await expect(
      requestEmbeddings({
        apiKey: "test-key",
        model: "test/model",
        texts: ["a"],
        timeoutMs: 5000,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ kind: "malformed" });
  });

  it("maps a timeout without retrying", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new DOMException("Timed out", "TimeoutError");
    });

    await expect(
      requestEmbeddings({
        apiKey: "test-key",
        model: "test/model",
        texts: ["a"],
        timeoutMs: 1000,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ kind: "timeout" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps 429 and 402 to explicit kinds", async () => {
    const rateLimited = vi.fn(async () => jsonResponse({}, 429));
    const noCredit = vi.fn(async () => jsonResponse({}, 402));

    await expect(
      requestEmbeddings({
        apiKey: "k",
        model: "m",
        texts: ["a"],
        timeoutMs: 1000,
        fetchImpl: rateLimited,
      }),
    ).rejects.toMatchObject({ kind: "rate_limited" });

    await expect(
      requestEmbeddings({
        apiKey: "k",
        model: "m",
        texts: ["a"],
        timeoutMs: 1000,
        fetchImpl: noCredit,
      }),
    ).rejects.toMatchObject({ kind: "quota" });
  });

  it("maps malformed JSON to a safe error", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("not-json", { status: 200 }),
    );

    await expect(
      requestEmbeddings({
        apiKey: "k",
        model: "m",
        texts: ["a"],
        timeoutMs: 1000,
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(OpenRouterEmbeddingError);
  });
});

describe("createOpenRouterEmbeddingProvider", () => {
  it("sends raw passages and query text without E5 prefixes", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(embeddingsResponse(1)));
    const provider = createOpenRouterEmbeddingProvider({
      apiKey: "test-key",
      model: {
        modelId: "openai/text-embedding-3-small",
        modelRevision: "rev-2026-11",
        dimensions: EMBEDDING_DIMENSIONS,
      },
      timeoutMs: 5000,
      fetchImpl,
    });

    await provider.embedPassages(["texto del documento"]);
    await provider.embedQuery("pregunta");

    const passageBody = JSON.parse(
      String(
        (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body,
      ),
    );
    const queryBody = JSON.parse(
      String(
        (fetchImpl.mock.calls[1] as unknown as [string, RequestInit])[1].body,
      ),
    );

    expect(passageBody.input).toEqual(["texto del documento"]);
    expect(queryBody.input).toEqual(["pregunta"]);
    expect(provider.model.modelRevision).toBe("rev-2026-11");
  });

  it("does not call the provider for an empty passage batch", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(embeddingsResponse(1)));
    const provider = createOpenRouterEmbeddingProvider({
      apiKey: "test-key",
      model: {
        modelId: "test/model",
        modelRevision: "rev",
        dimensions: EMBEDDING_DIMENSIONS,
      },
      timeoutMs: 5000,
      fetchImpl,
    });

    await expect(provider.embedPassages([])).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
