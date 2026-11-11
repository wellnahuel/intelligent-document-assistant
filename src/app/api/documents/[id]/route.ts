import { NextResponse } from "next/server";

import { toDocumentDetailDto } from "@/lib/documents/dto";
import { getDocumentWithPages } from "@/lib/documents/queries";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { id } = await params;
    const document = await getDocumentWithPages(id);

    if (!document) {
      throw new AppError("DOCUMENT_NOT_FOUND", "Documento no encontrado.");
    }

    return NextResponse.json({
      document: toDocumentDetailDto(document),
    });
  } catch (error) {
    return jsonError(
      error,
      "GET /api/documents/[id]",
      "No se pudo cargar el documento.",
    );
  }
}
