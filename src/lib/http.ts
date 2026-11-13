import { NextResponse } from "next/server";

import { AppError } from "@/lib/errors";
import {
  createRequestId,
  logEvent,
} from "@/lib/observability/log";

/**
 * Translates known application errors to safe HTTP responses.
 * Unknown errors are logged on the server and never leaked to the client.
 */
export function jsonError(
  error: unknown,
  context: string,
  fallbackMessage: string,
  requestId?: string,
): NextResponse {
  const headers = new Headers();

  if (requestId) {
    headers.set("x-request-id", requestId);
  }

  if (error instanceof AppError) {
    if (error.retryAfterSeconds !== null) {
      headers.set("Retry-After", String(error.retryAfterSeconds));
    }

    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.status, headers },
    );
  }

  logEvent("error", "http.unexpected_error", {
    requestId,
    route: context,
    kind: error instanceof Error ? error.name : "unknown",
  });
  console.error(`[${context}] Unexpected error.`, error);

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: fallbackMessage,
      },
    },
    { status: 500, headers },
  );
}

/**
 * Runs one route handler with a request id, an `x-request-id` response header
 * and a single structured completion log. The handler throws AppErrors as
 * usual; this wrapper maps them through jsonError.
 */
export async function runRoute(input: {
  request?: Request;
  route: string;
  fallbackMessage: string;
  handler: (requestId: string) => Promise<NextResponse>;
}): Promise<NextResponse> {
  const requestId = createRequestId(
    input.request?.headers.get("x-request-id") ?? null,
  );
  const startedAt = performance.now();
  let status = 500;
  let code: string | undefined;

  try {
    const response = await input.handler(requestId);
    response.headers.set("x-request-id", requestId);
    status = response.status;
    return response;
  } catch (error) {
    code = error instanceof AppError ? error.code : "INTERNAL_ERROR";
    const response = jsonError(
      error,
      input.route,
      input.fallbackMessage,
      requestId,
    );
    status = response.status;
    return response;
  } finally {
    logEvent(
      status >= 500 ? "error" : status >= 400 ? "warn" : "info",
      "http.request",
      {
        requestId,
        route: input.route,
        method: input.request?.method ?? "GET",
        status,
        code,
        durationMs: Math.round(performance.now() - startedAt),
      },
    );
  }
}
