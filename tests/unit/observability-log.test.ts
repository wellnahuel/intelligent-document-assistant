import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createRequestId,
  logEvent,
} from "@/lib/observability/log";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createRequestId", () => {
  it("accepts a safe inbound identifier", () => {
    expect(createRequestId("req-1234-abcd")).toBe("req-1234-abcd");
  });

  it("rejects an unsafe inbound identifier", () => {
    const id = createRequestId("bad id\nwith newline");

    expect(id).not.toBe("bad id\nwith newline");
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("generates a UUID when no candidate exists", () => {
    expect(createRequestId(null)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe("logEvent", () => {
  it("writes one JSON line with the allowed fields", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logEvent("info", "ask.completed", {
      requestId: "req-1234-abcd",
      route: "POST /api/ask",
      stage: "generation",
      durationMs: 120,
      totalTokens: 840,
    });

    expect(info).toHaveBeenCalledTimes(1);
    const line = String(info.mock.calls[0]?.[0]);
    const parsed = JSON.parse(line);

    expect(parsed).toMatchObject({
      level: "info",
      event: "ask.completed",
      requestId: "req-1234-abcd",
      route: "POST /api/ask",
      stage: "generation",
      durationMs: 120,
      totalTokens: 840,
    });
    expect(typeof parsed.timestamp).toBe("string");
  });

  it("drops prompt, document text, credentials and cookies", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    logEvent("info", "ask.completed", {
      requestId: "req-1234-abcd",
      question: "¿Cuánto dura la garantía?",
      prompt: "full prompt with document text",
      text: "PDF page text",
      apiKey: "sk-secret",
      password: "hunter2",
      cookie: "session=abc",
      authorization: "Bearer sk-secret",
      answer: "full model answer",
      durationMs: 90,
    });

    const line = String(info.mock.calls[0]?.[0]);

    expect(line).not.toContain("garantía");
    expect(line).not.toContain("full prompt");
    expect(line).not.toContain("PDF page text");
    expect(line).not.toContain("sk-secret");
    expect(line).not.toContain("hunter2");
    expect(line).not.toContain("session=abc");
    expect(line).not.toContain("full model answer");
    expect(JSON.parse(line).durationMs).toBe(90);
  });

  it("never throws for an invalid field value", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() =>
      logEvent("info", "ask.completed", {
        requestId: "req-1234-abcd",
        durationMs: circular as unknown as number,
      }),
    ).not.toThrow();
    expect(info).toHaveBeenCalledTimes(1);
  });
});
