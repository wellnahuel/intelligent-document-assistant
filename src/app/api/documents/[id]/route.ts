import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/dal";
import { toDocumentDetailDto } from "@/lib/documents/dto";
import { assertDocumentId } from "@/lib/documents/id";
import {
  deleteDocumentForUser,
  getDocumentDetailForUser,
} from "@/lib/documents/queries";
import { AppError } from "@/lib/errors";
import { runRoute } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  return runRoute({
    request,
    route: "GET /api/documents/[id]",
    fallbackMessage: "No se pudo cargar el documento.",
    handler: async () => {
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
    },
  });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  return runRoute({
    request,
    route: "DELETE /api/documents/[id]",
    fallbackMessage: "No se pudo borrar el documento.",
    handler: async () => {
      const user = await requireApiUser();
      const { id } = await params;

      assertDocumentId(id);

      const deleted = await deleteDocumentForUser(user.id, id);

      if (deleted === 0) {
        // Same response as a nonexistent document: existence is not revealed.
        throw new AppError("DOCUMENT_NOT_FOUND", "Documento no encontrado.");
      }

      return NextResponse.json({ deleted: true });
    },
  });
}
