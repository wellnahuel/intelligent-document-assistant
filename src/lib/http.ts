import { NextResponse } from "next/server";

import { AppError } from "@/lib/errors";

/**
 * Translates known application errors to safe HTTP responses.
 * Unknown errors are logged on the server and never leaked to the client.
 */
export function jsonError(
  error: unknown,
  context: string,
  fallbackMessage: string,
): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
        },
      },
      { status: error.status },
    );
  }

  console.error(`[${context}] Unexpected error.`, error);

  return NextResponse.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: fallbackMessage,
      },
    },
    { status: 500 },
  );
}
