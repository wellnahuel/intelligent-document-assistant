import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/dal";
import { toDocumentDetailDto } from "@/lib/documents/dto";
import { assertDocumentId } from "@/lib/documents/id";
import {
  deleteDocumentForUser,
  getDocumentDetailForUser,
} from "@/lib/documents/queries";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireApiUser();
    const { id } = await params;

    assertDocumentId(id);

    const document = await getDocumentDetailForUser(user.id, id);

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

export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireApiUser();
    const { id } = await params;

    assertDocumentId(id);

    const deleted = await deleteDocumentForUser(user.id, id);

    if (deleted === 0) {
      // Same response as a nonexistent document: existence is not revealed.
      throw new AppError("DOCUMENT_NOT_FOUND", "Documento no encontrado.");
    }

    return NextResponse.json({ deleted: true });
  } catch (error) {
    return jsonError(
      error,
      "DELETE /api/documents/[id]",
      "No se pudo borrar el documento.",
    );
  }
}
