import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/dal";
import { assertDocumentId } from "@/lib/documents/id";
import { getEmbeddingConfig } from "@/lib/embeddings/config";
import { generateDocumentEmbeddings } from "@/lib/embeddings/generate";
import { parseGenerationOptions } from "@/lib/embeddings/input";
import { AppError } from "@/lib/errors";
import { runRoute } from "@/lib/http";
import { logEvent } from "@/lib/observability/log";
import { ACTION_WINDOW_SECONDS, getUsageLimits } from "@/lib/rate-limit/config";
import { userActionKey } from "@/lib/rate-limit/keys";
import { assertRateLimit } from "@/lib/rate-limit/limiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const MAX_BODY_BYTES = 1024;

export async function POST(request: Request, { params }: RouteContext) {
  return runRoute({
    request,
    route: "POST /api/documents/[id]/embeddings",
    fallbackMessage: "No se pudieron generar los embeddings.",
    handler: async (requestId) => {
      const startedAt = performance.now();
      const user = await requireApiUser();
      const { id } = await params;

      assertDocumentId(id);

      const usageLimits = getUsageLimits();

      await assertRateLimit({
        key: userActionKey(user.id, "embeddings"),
        limit: usageLimits.embeddingsPerHour,
        windowSeconds: ACTION_WINDOW_SECONDS,
      });

      const rawBody = await request.text();

      if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
        throw new AppError(
          "INVALID_REQUEST_BODY",
          "El cuerpo de la solicitud es demasiado grande.",
        );
      }

      let body: unknown = {};

      if (rawBody.trim().length > 0) {
        try {
          body = JSON.parse(rawBody);
        } catch {
          throw new AppError(
            "INVALID_REQUEST_BODY",
            "El cuerpo de la solicitud no es JSON válido.",
          );
        }
      }

      const options = parseGenerationOptions(body);
      const result = await generateDocumentEmbeddings({
        userId: user.id,
        documentId: id,
        options,
        requestId,
      });

      logEvent("info", "embeddings.generated", {
        requestId,
        route: "POST /api/documents/[id]/embeddings",
        stage: "embedding",
        outcome: result.status,
        provider: getEmbeddingConfig().provider,
        model: result.model.modelId,
        chunkCount: result.chunkCount,
        generatedCount: result.generatedCount,
        skippedCount: result.skippedCount,
        failedCount: result.failedCount,
        durationMs: Math.round(performance.now() - startedAt),
      });

      return NextResponse.json(result);
    },
  });
}
