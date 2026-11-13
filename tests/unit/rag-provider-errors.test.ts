import { describe, expect, it } from "vitest";

import { mapProviderError } from "@/lib/rag/provider-errors";
import { OpenRouterError } from "@/lib/rag/openrouter";

describe("safe OpenRouter error mapping", () => {
  it("maps a 429 to a retryable RAG rate-limit error", () => {
    const mapped = mapProviderError(
      new OpenRouterError("http", "provider details", 429),
    );

    expect(mapped.code).toBe("RAG_PROVIDER_RATE_LIMITED");
    expect(mapped.status).toBe(429);
    expect(mapped.message).not.toContain("provider details");
  });

  it("maps a 402 to a quota error without provider details", () => {
    const mapped = mapProviderError(
      new OpenRouterError("http", "insufficient credits: sk-or-secret", 402),
    );

    expect(mapped.code).toBe("RAG_PROVIDER_QUOTA_EXCEEDED");
    expect(mapped.status).toBe(503);
    expect(mapped.message).not.toContain("sk-or-secret");
  });

  it("maps timeouts and unexpected failures to safe statuses", () => {
    const timeout = mapProviderError(
      new OpenRouterError("timeout", "network timeout"),
    );
    const failure = mapProviderError(
      new OpenRouterError("http", "internal stack", 500),
    );

    expect(timeout.code).toBe("RAG_PROVIDER_TIMEOUT");
    expect(timeout.status).toBe(504);
    expect(failure.code).toBe("RAG_PROVIDER_ERROR");
    expect(failure.status).toBe(502);
    expect(failure.message).not.toContain("internal stack");
  });
});
