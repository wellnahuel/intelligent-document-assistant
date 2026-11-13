import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/dal";
import { regenerateDocumentChunks } from "@/lib/documents/chunks";
import { assertDocumentId } from "@/lib/documents/id";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireApiUser();
    const { id } = await params;

    assertDocumentId(id);

    const result = await regenerateDocumentChunks(user.id, id);

    return NextResponse.json(result);
  } catch (error) {
    return jsonError(
      error,
      "POST /api/documents/[id]/chunks",
      "No se pudieron generar los fragmentos.",
    );
  }
}
