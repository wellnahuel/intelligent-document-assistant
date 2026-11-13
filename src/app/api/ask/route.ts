import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/dal";
import { jsonError } from "@/lib/http";
import { answerDocumentQuestion } from "@/lib/rag/ask";
import { getRagConfig } from "@/lib/rag/config";
import { parseAskRequest } from "@/lib/rag/input";
import { AppError } from "@/lib/errors";
import { ACTION_WINDOW_SECONDS, getUsageLimits } from "@/lib/rate-limit/config";
import { userActionKey } from "@/lib/rate-limit/keys";
import { assertRateLimit } from "@/lib/rate-limit/limiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16384;

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const usageLimits = getUsageLimits();

    await assertRateLimit({
      key: userActionKey(user.id, "ask"),
      limit: usageLimits.questionsPerHour,
      windowSeconds: ACTION_WINDOW_SECONDS,
    });

    const rawBody = await request.text();

    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) {
      throw new AppError(
        "INVALID_REQUEST_BODY",
        "El cuerpo de la consulta es demasiado grande.",
      );
    }

    let body: unknown;

    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new AppError(
        "INVALID_REQUEST_BODY",
        "El cuerpo de la consulta no es JSON válido.",
      );
    }

    const config = getRagConfig();
    const input = parseAskRequest(body, config.questionMaxChars);
    const result = await answerDocumentQuestion({
      ...input,
      userId: user.id,
    });

    return NextResponse.json({ ask: result });
  } catch (error) {
    return jsonError(
      error,
      "POST /api/ask",
      "No se pudo generar la respuesta.",
    );
  }
}
