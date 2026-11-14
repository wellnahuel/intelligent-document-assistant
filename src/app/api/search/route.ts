import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/dal";
import { parseSearchRequest } from "@/lib/embeddings/input";
import { searchChunks } from "@/lib/embeddings/search";
import { runRoute } from "@/lib/http";
import { logEvent } from "@/lib/observability/log";
import { ACTION_WINDOW_SECONDS, getUsageLimits } from "@/lib/rate-limit/config";
import { userActionKey } from "@/lib/rate-limit/keys";
import { assertRateLimit } from "@/lib/rate-limit/limiter";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4096;

export async function POST(request: Request) {
  return runRoute({
    request,
    route: "POST /api/search",
    fallbackMessage: "No se pudo realizar la búsqueda.",
    handler: async (requestId) => {
      const startedAt = performance.now();
      const user = await requireApiUser();
      const usageLimits = getUsageLimits();

      await assertRateLimit({
        key: userActionKey(user.id, "search"),
        limit: usageLimits.searchesPerHour,
        windowSeconds: ACTION_WINDOW_SECONDS,
      });

      const rawBody = await request.text();

      if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
        throw new AppError(
          "INVALID_REQUEST_BODY",
          "El cuerpo de la búsqueda es demasiado grande.",
        );
      }

      let body: unknown;

      try {
        body = JSON.parse(rawBody);
      } catch {
        throw new AppError(
          "INVALID_REQUEST_BODY",
          "El cuerpo de la búsqueda no es JSON válido.",
        );
      }

      const input = parseSearchRequest(body);
      const result = await searchChunks(user.id, input);

      logEvent("info", "search.completed", {
        requestId,
        route: "POST /api/search",
        stage: "vector_search",
        outcome: "completed",
        topK: result.topK,
        retrievedCount: result.results.length,
        indexedChunkCount: result.indexedChunkCount,
        model: result.model.modelId,
        durationMs: Math.round(performance.now() - startedAt),
      });

      return NextResponse.json({ search: result });
    },
  });
}
