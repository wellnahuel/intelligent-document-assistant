import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/dal";
import { getUploadLimits } from "@/lib/config";
import { createDocumentWithPages } from "@/lib/documents/create-document";
import { toDocumentSummaryDto } from "@/lib/documents/dto";
import { listDocumentsForUser } from "@/lib/documents/queries";
import { AppError } from "@/lib/errors";
import { runRoute } from "@/lib/http";
import { logEvent } from "@/lib/observability/log";
import { extractPdfPages } from "@/lib/pdf/extract-text";
import { validatePdfUpload } from "@/lib/pdf/validation";
import { ACTION_WINDOW_SECONDS, getUsageLimits } from "@/lib/rate-limit/config";
import { userActionKey } from "@/lib/rate-limit/keys";
import { assertRateLimit } from "@/lib/rate-limit/limiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return runRoute({
    route: "GET /api/documents",
    fallbackMessage: "No se pudieron cargar los documentos.",
    handler: async () => {
      const user = await requireApiUser();
      const documents = await listDocumentsForUser(user.id);

      return NextResponse.json({
        documents: documents.map(toDocumentSummaryDto),
      });
    },
  });
}

export async function POST(request: Request) {
  return runRoute({
    request,
    route: "POST /api/documents",
    fallbackMessage: "No se pudo procesar el documento. Intenta nuevamente.",
    handler: async (requestId) => {
      const startedAt = performance.now();
      const user = await requireApiUser();
      const usageLimits = getUsageLimits();

      await assertRateLimit({
        key: userActionKey(user.id, "upload"),
        limit: usageLimits.uploadsPerHour,
        windowSeconds: ACTION_WINDOW_SECONDS,
      });

      let formData: FormData;

      try {
        formData = await request.formData();
      } catch (error) {
        console.error("[POST /api/documents] Invalid form data.", error);
        throw new AppError(
          "INVALID_FORM_DATA",
          "No se pudo leer el archivo enviado. Intenta nuevamente.",
        );
      }

      const limits = getUploadLimits();
      const pdf = await validatePdfUpload(formData.get("file"), limits);
      const extraction = await extractPdfPages(pdf.bytes, limits);

      const document = await createDocumentWithPages({
        userId: user.id,
        originalFilename: pdf.originalFilename,
        mimeType: pdf.mimeType,
        sizeBytes: pdf.sizeBytes,
        pageCount: extraction.pageCount,
        pages: extraction.pages,
        maxDocumentsPerUser: usageLimits.maxDocumentsPerUser,
      });

      logEvent("info", "document.uploaded", {
        requestId,
        route: "POST /api/documents",
        stage: "extraction",
        outcome: "completed",
        sizeBytes: pdf.sizeBytes,
        pageCount: extraction.pageCount,
        durationMs: Math.round(performance.now() - startedAt),
      });

      return NextResponse.json(
        {
          document: toDocumentSummaryDto(document),
        },
        { status: 201 },
      );
    },
  });
}
