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
  }>;
};

export function toDocumentSummaryDto(
  document: DocumentSummarySource,
): DocumentSummaryDto {
  return {
    ...document,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

export function toDocumentDetailDto(
  document: DocumentDetailSource,
): DocumentDetailDto {
  return {
    ...toDocumentSummaryDto(document),
    pages: document.pages.map((page) => ({
      id: page.id,
      pageNumber: page.pageNumber,
      text: page.text,
    })),
  };
}
