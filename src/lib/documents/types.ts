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
  chunks: DocumentChunkDto[];
};

export type DocumentChunkDto = {
  id: string;
  documentPageId: string;
  chunkIndex: number;
  content: string;
  startChar: number;
  endChar: number;
};

export type ChunkingConfigDto = {
  targetChars: number;
  overlapChars: number;
  minChars: number;
};

export type ChunkGenerationPageDto = {
  pageId: string;
  pageNumber: number;
  chunks: DocumentChunkDto[];
};

export type ChunkGenerationResultDto = {
  documentId: string;
  chunkCount: number;
  pageCount: number;
  chunking: ChunkingConfigDto;
  pages: ChunkGenerationPageDto[];
};

export type DocumentDetailDto = DocumentSummaryDto & {
  pages: DocumentPageDto[];
};

export type UploadLimitsDto = {
  maxSizeMb: number;
  maxPages: number;
};
