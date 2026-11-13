import type {
  DocumentDetailDto,
  DocumentSummaryDto,
} from "@/lib/documents/types";

type DocumentSummarySource = {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
  status: "PROCESSED" | "FAILED";
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type DocumentDetailSource = DocumentSummarySource & {
  pages: Array<{
    id: string;
    pageNumber: number;
    text: string;
    chunks: Array<{
      id: string;
      documentPageId: string;
      chunkIndex: number;
      content: string;
      startChar: number;
      endChar: number;
    }>;
  }>;
};

function summaryFields(document: DocumentSummarySource): DocumentSummaryDto {
  // Explicit fields: adding userId or another internal column to the model
  // must not silently add it to an API response.
  return {
    id: document.id,
    originalFilename: document.originalFilename,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    pageCount: document.pageCount,
    status: document.status,
    errorMessage: document.errorMessage,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

export function toDocumentSummaryDto(
  document: DocumentSummarySource,
): DocumentSummaryDto {
  return summaryFields(document);
}

export function toDocumentDetailDto(
  document: DocumentDetailSource,
): DocumentDetailDto {
  return {
    ...summaryFields(document),
    pages: document.pages.map((page) => ({
      id: page.id,
      pageNumber: page.pageNumber,
      text: page.text,
      chunks: page.chunks.map((chunk) => ({
        id: chunk.id,
        documentPageId: chunk.documentPageId,
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        startChar: chunk.startChar,
        endChar: chunk.endChar,
      })),
    })),
  };
}
