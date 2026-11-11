import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import type { UploadLimits } from "@/lib/config";
import { AppError } from "@/lib/errors";
import { STANDARD_FONT_DATA_URL } from "@/lib/pdf/pdfjs-config";

export type ExtractedPage = {
  pageNumber: number;
  text: string;
};

export type PdfExtractionResult = {
  pageCount: number;
  pages: ExtractedPage[];
};

type PdfDocument = Awaited<ReturnType<typeof getDocument>["promise"]>;

function isTextItem(
  item: unknown,
): item is { str: string; hasEOL?: boolean } {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    typeof (item as { str: unknown }).str === "string"
  );
}

function normalizePageText(items: unknown[]): string {
  let text = "";

  for (const item of items) {
    if (!isTextItem(item)) {
      continue;
    }

    text += item.str;
    text += item.hasEOL === true ? "\n" : " ";
  }

  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extractPdfPages(
  bytes: Uint8Array,
  limits: UploadLimits,
): Promise<PdfExtractionResult> {
  let loadingTask: ReturnType<typeof getDocument> | null = null;
  let pdf: PdfDocument;

  try {
    // PDF.js may transfer the buffer to its worker, so pass a copy.
    loadingTask = getDocument({
      data: bytes.slice(),
      standardFontDataUrl: STANDARD_FONT_DATA_URL,
    });
    pdf = await loadingTask.promise;
  } catch (error) {
    console.error("[pdf] Could not parse the document.", error);
    throw new AppError(
      "CORRUPT_PDF",
      "No se pudo leer el PDF. Verifica que el archivo no esté dañado.",
    );
  }

  try {
    if (pdf.numPages > limits.maxPages) {
      throw new AppError(
        "TOO_MANY_PAGES",
        `El PDF supera el límite de ${limits.maxPages} páginas.`,
      );
    }

    const pages: ExtractedPage[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);

      try {
        const content = await page.getTextContent();
        pages.push({
          pageNumber,
          text: normalizePageText(content.items),
        });
      } finally {
        page.cleanup();
      }
    }

    if (!pages.some((page) => page.text.length > 0)) {
      throw new AppError(
        "NO_EXTRACTABLE_TEXT",
        "No se encontró texto seleccionable en el PDF.",
      );
    }

    return {
      pageCount: pdf.numPages,
      pages,
    };
  } finally {
    if (loadingTask) {
      try {
        await loadingTask.destroy();
      } catch (error) {
        console.error("[pdf] Could not release the document.", error);
      }
    }
  }
}
