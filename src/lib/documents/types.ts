export type DocumentStatusValue = "PROCESSED" | "FAILED";

export type DocumentSummaryDto = {
  id: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
  status: DocumentStatusValue;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type DocumentPageDto = {
  id: string;
  pageNumber: number;
  text: string;
};

export type DocumentDetailDto = DocumentSummaryDto & {
  pages: DocumentPageDto[];
};

export type UploadLimitsDto = {
  maxSizeMb: number;
  maxPages: number;
};
