/**
 * Shared contracts for the retrieval strategies used by the Sprint 5
 * evaluation. Vector, lexical and hybrid results keep the same chunk metadata
 * so the report can compare them without losing citation data.
 */

export type RetrievalSource = "vector" | "lexical";

export type RetrievalStrategy =
  | "vector"
  | "lexical"
  | "hybrid"
  | "hybrid-rerank";

export type RetrievalHit = {
  chunkId: string;
  documentId: string;
  documentName: string;
  pageNumber: number;
  chunkIndex: number;
  content: string;
  score: number;
};

export type VectorHit = RetrievalHit & {
  distance: number;
};

export type LexicalHit = RetrievalHit & {
  lexicalScore: number;
};

export type SourceRank = {
  source: RetrievalSource;
  rank: number;
  score: number;
};

export type HybridHit = RetrievalHit & {
  rrfScore: number;
  sourceRanks: SourceRank[];
};

export type RerankCandidate = {
  chunkId: string;
  content: string;
};

export type RerankRequest = {
  query: string;
  candidates: readonly RerankCandidate[];
  topN: number;
};

export type RerankItem = {
  chunkId: string;
  providerIndex: number;
  relevanceScore: number;
};

export type RerankUsage = {
  searchUnits: number | null;
  totalTokens: number | null;
  cost: number | null;
};

export type RerankOutcome = {
  model: string;
  items: RerankItem[];
  usage: RerankUsage | null;
  latencyMs: number;
};

export interface Reranker {
  readonly model: string;
  rerank(input: RerankRequest): Promise<RerankOutcome>;
}

export type RerankedHit = RetrievalHit & {
  relevanceScore: number;
  originalRank: number;
  providerIndex: number;
};
