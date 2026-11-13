import { describe, expect, it, vi } from "vitest";

import {
  OPENROUTER_CHAT_COMPLETIONS_URL,
  OpenRouterError,
  requestChatCompletion,
  type FetchLike,
} from "@/lib/rag/openrouter";
import type { OpenRouterConfig } from "@/lib/rag/types";

const CONFIG: OpenRouterConfig = {
  apiKey: "test-secret-key",
  model: "test/model",
  timeoutMs: 1000,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function completionBody(overrides: Record<string, unknown> = {}) {
  return {
    choices: [
      {
        message: { role: "assistant", content: "La garantía es de dos años [S1]." },
        finish_reason: "stop",
      },
    ],
    model: "test/model-v2",
    usage: {
      prompt_tokens: 120,
      completion_tokens: 20,
      total_tokens: 140,
      cost: 0.0002,
    },
    ...overrides,
  };
}

describe("OpenRouter Chat Completions client", () => {
  it("sends a non-streaming request and normalizes the completion", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse(completionBody()),
    );

    const result = await requestChatCompletion({
      config: CONFIG,
      system: "system instructions",
      user: "question and sources",
      fetchImpl,
    });

    expect(result).toEqual({
      content: "La garantía es de dos años [S1].",
      model: "test/model-v2",
      finishReason: "stop",
      usage: {
        promptTokens: 120,
        completionTokens: 20,
        totalTokens: 140,
        cost: 0.0002,
      },
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe(OPENROUTER_CHAT_COMPLETIONS_URL);
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-secret-key",
      "Content-Type": "application/json",
    });

    const body = JSON.parse(String(init?.body)) as {
      model: string;
      stream: boolean;
      messages: Array<{ role: string; content: string }>;
      temperature?: unknown;
      top_p?: unknown;
    };

    expect(body.model).toBe("test/model");
    expect(body.stream).toBe(false);
    expect(body.messages).toEqual([
      { role: "system", content: "system instructions" },
      { role: "user", content: "question and sources" },
    ]);
    expect(body.temperature).toBeUndefined();
    expect(body.top_p).toBeUndefined();
  });

  it("maps a timeout to a safe timeout error", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () => {
      throw new DOMException(
        "The operation was aborted due to timeout",
        "TimeoutError",
      );
    });

    await expect(
      requestChatCompletion({
        config: CONFIG,
        system: "s",
        user: "u",
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      name: "OpenRouterError",
      kind: "timeout",
      status: null,
    });
  });

  it("maps HTTP errors and never includes the API key in the error", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      new Response("rate limited", { status: 429 }),
    );

    let caught: unknown;

    try {
      await requestChatCompletion({
        config: CONFIG,
        system: "s",
        user: "u",
        fetchImpl,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(OpenRouterError);
    expect(caught).toMatchObject({ kind: "http", status: 429 });
    expect((caught as Error).message).not.toContain(CONFIG.apiKey);
  });

  it("rejects malformed JSON", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      new Response("not-json", { status: 200 }),
    );

    await expect(
      requestChatCompletion({
        config: CONFIG,
        system: "s",
        user: "u",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ kind: "malformed", status: 200 });
  });

  it("rejects a 200 response that only contains an error object", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse({ error: { code: 502, message: "upstream failed" } }),
    );

    await expect(
      requestChatCompletion({
        config: CONFIG,
        system: "s",
        user: "u",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ kind: "upstream", status: 200 });
  });

  it("rejects an empty completion", async () => {
    const fetchImpl = vi.fn<FetchLike>(async () =>
      jsonResponse(
        completionBody({
          choices: [{ message: { role: "assistant", content: "   " } }],
        }),
      ),
    );

    await expect(
      requestChatCompletion({
        config: CONFIG,
        system: "s",
        user: "u",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ kind: "malformed" });
  });
});
