import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/dal";
import { regenerateDocumentChunks } from "@/lib/documents/chunks";
import { assertDocumentId } from "@/lib/documents/id";
import { runRoute } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, { params }: RouteContext) {
  return runRoute({
    request,
    route: "POST /api/documents/[id]/chunks",
    fallbackMessage: "No se pudieron generar los fragmentos.",
    handler: async () => {
      const user = await requireApiUser();
      const { id } = await params;

      assertDocumentId(id);

      const result = await regenerateDocumentChunks(user.id, id);

      return NextResponse.json(result);
    },
  });
}
