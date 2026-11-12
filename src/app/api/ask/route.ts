import { NextResponse } from "next/server";

import { answerDocumentQuestion } from "@/lib/rag/ask";
import { getRagConfig } from "@/lib/rag/config";
import { parseAskRequest } from "@/lib/rag/input";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16384;

export async function POST(request: Request) {
  try {
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
    const result = await answerDocumentQuestion(input);

    return NextResponse.json({ ask: result });
  } catch (error) {
    return jsonError(
      error,
      "POST /api/ask",
      "No se pudo generar la respuesta.",
    );
  }
}
