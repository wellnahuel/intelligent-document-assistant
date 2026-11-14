/**
 * Structured, privacy-bounded logging.
 *
 * Only the fields in ALLOWED_FIELDS are written. Anything else is dropped,
 * which keeps questions, prompts, document text, cookies, credentials and
 * model answers out of the logs even if a caller passes them by mistake.
 */

export type LogLevel = "info" | "warn" | "error";

const ALLOWED_FIELDS = new Set([
  "requestId",
  "route",
  "method",
  "stage",
  "outcome",
  "durationMs",
  "embeddingMs",
  "searchMs",
  "retrievalMs",
  "generationMs",
  "totalMs",
  "status",
  "httpStatus",
  "code",
  "kind",
  "provider",
  "model",
  "topK",
  "retrievedCount",
  "indexedChunkCount",
  "sourceCount",
  "citedCount",
  "promptTokens",
  "completionTokens",
  "totalTokens",
  "costUsd",
  "batchIndex",
  "batchCount",
  "chunkCount",
  "generatedCount",
  "failedCount",
  "skippedCount",
  "pageCount",
  "sizeBytes",
]);

const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

function isLoggableValue(value: unknown): value is string | number | boolean | null {
  if (value === null) {
    return true;
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return true;
  }

  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Uses an inbound request id only when it is a short, safe token. Otherwise
 * generates one. User-controlled text never reaches the log line.
 */
export function createRequestId(candidate?: string | null): string {
  const trimmed = candidate?.trim();

  if (trimmed && SAFE_REQUEST_ID.test(trimmed)) {
    return trimmed;
  }

  return crypto.randomUUID();
}

export function logEvent(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  try {
    const payload: Record<string, unknown> = {
      level,
      event,
      timestamp: new Date().toISOString(),
    };

    for (const [key, value] of Object.entries(fields)) {
      if (!ALLOWED_FIELDS.has(key) || !isLoggableValue(value)) {
        continue;
      }

      payload[key] = value;
    }

    const line = JSON.stringify(payload);

    if (level === "error") {
      console.error(line);
    } else if (level === "warn") {
      console.warn(line);
    } else {
      console.info(line);
    }
  } catch {
    // Observability must never break the request.
  }
}
