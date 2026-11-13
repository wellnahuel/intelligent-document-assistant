import { NextResponse } from "next/server";

import { requireApiUser } from "@/lib/dal";
import { getUploadLimits } from "@/lib/config";
import { createDocumentWithPages } from "@/lib/documents/create-document";
import { toDocumentSummaryDto } from "@/lib/documents/dto";
import { listDocumentsForUser } from "@/lib/documents/queries";
import { AppError } from "@/lib/errors";
import { jsonError } from "@/lib/http";
import { extractPdfPages } from "@/lib/pdf/extract-text";
import { validatePdfUpload } from "@/lib/pdf/validation";
import { ACTION_WINDOW_SECONDS, getUsageLimits } from "@/lib/rate-limit/config";
import { userActionKey } from "@/lib/rate-limit/keys";
import { assertRateLimit } from "@/lib/rate-limit/limiter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireApiUser();
    const documents = await listDocumentsForUser(user.id);

    return NextResponse.json({
      documents: documents.map(toDocumentSummaryDto),
    });
  } catch (error) {
    return jsonError(
      error,
      "GET /api/documents",
      "No se pudieron cargar los documentos.",
    );
  }
}

export async function POST(request: Request) {
  try {
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

    return NextResponse.json(
      {
        document: toDocumentSummaryDto(document),
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(
      error,
      "POST /api/documents",
      "No se pudo procesar el documento. Intenta nuevamente.",
    );
  }
}
