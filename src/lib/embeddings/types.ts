export type EmbeddingModelInfo = {
  modelId: string;
  modelRevision: string;
  dimensions: number;
};

/**
 * Small boundary around local inference. Callers never see tensors or the
 * Transformers.js pipeline, and the E5 prefixes live in one place.
 */
export type EmbeddingProvider = {
  readonly model: EmbeddingModelInfo;
  embedPassages(texts: readonly string[]): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
};

export type EmbeddingGenerationStatus =
  | "complete"
  | "partial"
  | "failed";

export type EmbeddingGenerationErrorDto = {
  batch: number;
  stage: "embedding" | "persistence";
  message: string;
};

export type EmbeddingGenerationResultDto = {
  documentId: string;
  model: EmbeddingModelInfo;
  chunkCount: number;
  embeddedChunkCount: number;
  generatedCount: number;
  skippedCount: number;
  failedCount: number;
  status: EmbeddingGenerationStatus;
  errors: EmbeddingGenerationErrorDto[];
};

export type DocumentEmbeddingSummaryDto = {
  model: EmbeddingModelInfo;
  chunkCount: number;
  embeddedChunkCount: number;
};

export type ChunkSearchResultDto = {
  chunkId: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  chunkIndex: number;
  content: string;
  distance: number;
  similarity: number;
};

export type ChunkSearchResponseDto = {
  query: string;
  topK: number;
  model: EmbeddingModelInfo;
  indexedChunkCount: number;
  results: ChunkSearchResultDto[];
};

export type SearchLimitsDto = {
  defaultTopK: number;
  maxTopK: number;
  queryMaxChars: number;
};

export type GenerationOptions = {
  regenerate: boolean;
};
