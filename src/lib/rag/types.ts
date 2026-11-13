export type RagConfig = {
  topK: number;
  questionMaxChars: number;
  maxContextChars: number;
  providerTimeoutMs: number;
  openRouterModel: string;
};

export type OpenRouterConfig = {
  apiKey: string;
  model: string;
  timeoutMs: number;
};

export type OpenRouterUsage = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cost: number | null;
};

export type OpenRouterCompletion = {
  content: string;
  model: string;
  finishReason: string | null;
  usage: OpenRouterUsage | null;
};

export type RetrievedChunk = {
  chunkId: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  chunkIndex: number;
  content: string;
  distance: number;
};

export type PromptSource = {
  sourceId: string;
  chunkId: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  chunkIndex: number;
  contextText: string;
  excerpt: string;
  retrievalDistance: number;
};

export type PreparedRagPrompt = {
  system: string;
  user: string;
  sources: PromptSource[];
  contextChars: number;
  truncated: boolean;
};

export type RagSourceDto = {
  sourceId: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  chunkId: string;
  excerpt: string;
  retrievalDistance: number;
  cited: boolean;
};

export type RagUsageDto = {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  cost: number | null;
};

export type RagNoEvidenceReason = "no_embeddings" | "context_budget";

export type RagRetrievalInfo = {
  topK: number;
  retrievedCount: number;
  indexedChunkCount: number;
};

export type RagAnswerDto = {
  documentId: string;
  documentName: string;
  question: string;
  answer: string;
  sources: RagSourceDto[];
  citedSourceIds: string[];
  noEvidence: boolean;
  noEvidenceReason: RagNoEvidenceReason | null;
  model: string | null;
  usage: RagUsageDto | null;
  contextChars: number;
  retrieval: RagRetrievalInfo;
};

export type AskDocumentOptionDto = {
  id: string;
  originalFilename: string;
  pageCount: number;
  embeddedChunkCount: number;
};

export type AskRequestInput = {
  documentId: string;
  question: string;
};
