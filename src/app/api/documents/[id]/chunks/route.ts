import { NextResponse } from "next/server";

import { regenerateDocumentChunks } from "@/lib/documents/chunks";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

// Prisma cuid() ids are URL-safe alphanumeric strings. Keeping the check
// narrow rejects malformed ids before they reach the database.
const DOCUMENT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;

    if (!DOCUMENT_ID_PATTERN.test(id)) {
      throw new AppError(
        "INVALID_DOCUMENT_ID",
        "El identificador del documento no es válido.",
      );
    }

    const result = await regenerateDocumentChunks(id);

    return NextResponse.json(result);
  } catch (error) {
    return jsonError(
      error,
      "POST /api/documents/[id]/chunks",
      "No se pudieron generar los fragmentos.",
    );
  }
}
