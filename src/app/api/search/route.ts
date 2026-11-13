import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/dal";
import { parseSearchRequest } from "@/lib/embeddings/input";
import { searchChunks } from "@/lib/embeddings/search";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http";
import { ACTION_WINDOW_SECONDS, getUsageLimits } from "@/lib/rate-limit/config";
import { userActionKey } from "@/lib/rate-limit/keys";
import { assertRateLimit } from "@/lib/rate-limit/limiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4096;

export async function POST(request: Request) {
  try {
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

    return NextResponse.json({ search: result });
  } catch (error) {
    return jsonError(
      error,
      "POST /api/search",
      "No se pudo realizar la búsqueda.",
    );
  }
}
