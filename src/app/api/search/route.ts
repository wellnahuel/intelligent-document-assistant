import { NextResponse } from "next/server";

import { parseSearchRequest } from "@/lib/embeddings/input";
import { searchChunks } from "@/lib/embeddings/search";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4096;

export async function POST(request: Request) {
  try {
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
    const result = await searchChunks(input);

    return NextResponse.json({ search: result });
  } catch (error) {
    return jsonError(
      error,
      "POST /api/search",
      "No se pudo realizar la búsqueda.",
    );
  }
}
