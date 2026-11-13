import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/dal";
import { generateDocumentEmbeddings } from "@/lib/embeddings/generate";
import { parseGenerationOptions } from "@/lib/embeddings/input";
import { assertDocumentId } from "@/lib/documents/id";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http";
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
  try {
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
    });

    return NextResponse.json(result);
  } catch (error) {
    return jsonError(
      error,
      "POST /api/documents/[id]/embeddings",
      "No se pudieron generar los embeddings.",
    );
  }
}
