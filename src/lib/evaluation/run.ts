import type { EmbeddingModelInfo, EmbeddingProvider } from "@/lib/embeddings/types";
import type { ValidatedDataset } from "@/lib/evaluation/dataset";
import {
  computeRetrievalMetrics,
  mean,
  type RetrievalMetrics,
} from "@/lib/evaluation/metrics";
import { RerankError } from "@/lib/retrieval/openrouter-reranker";
import { searchHybridCandidates } from "@/lib/retrieval/hybrid";
import { searchLexicalChunks } from "@/lib/retrieval/lexical";
import { searchVectorCandidates } from "@/lib/retrieval/vector";
import type { RetrievalConfig } from "@/lib/retrieval/config";
import type {
  HybridHit,
  RerankedHit,
  Reranker,
  RerankUsage,
} from "@/lib/retrieval/types";

export type StrategyName =
  | "vector"
  | "lexical"
  | "hybrid"
  | "hybrid-rerank";

export const EVALUATION_STRATEGIES: readonly StrategyName[] = [
  "vector",
  "lexical",
  "hybrid",
  "hybrid-rerank",
];

export type CaseStrategyResult = {
  strategy: StrategyName;
  chunkIds: string[];
  relevantRanks: Record<string, number | null>;
  metrics: RetrievalMetrics;
  latencyMs: number;
  rerank: {
    model: string;
    usage: RerankUsage | null;
    latencyMs: number;
  } | null;
  error: string | null;
};

export type CaseResult = {
  id: string;
  question: string;
  documentId: string;
  answerable: boolean;
  relevantChunkIds: string[];
  embeddingMs: number | null;
  strategies: CaseStrategyResult[];
};

export type StrategyAggregate = {
  strategy: StrategyName;
  caseCount: number;
  answerableCaseCount: number;
  /**
   * Answerable cases with a successful result that contributed to the metric
   * means. It is smaller than answerableCaseCount when a case failed.
   */
  metricCaseCount: number;
  failedCaseCount: number;
  skipped: boolean;
  skipReason: string | null;
  recallAtK: number | null;
  precisionAtK: number | null;
  mrr: number | null;
  meanLatencyMs: number | null;
  rerankModel: string | null;
  rerankLatencyMs: number | null;
  rerankUsage: RerankUsage | null;
};

export type RerankStats = {
  model: string | null;
  latencyMs: number | null;
  usage: RerankUsage | null;
  aborted: boolean;
  abortReason: string | null;
};

export type EvaluationRunResult = {
  cases: CaseResult[];
  strategies: StrategyAggregate[];
  embeddingMs: number | null;
  rerank: RerankStats;
};

export type RunEvaluationInput = {
  dataset: ValidatedDataset;
  model: EmbeddingModelInfo;
  provider: EmbeddingProvider;
  config: RetrievalConfig;
  topK: number;
  reranker: Reranker | null;
  rerankSkipReason: string | null;
  strategies?: readonly StrategyName[];
};

function describeError(error: unknown): string {
  if (error instanceof RerankError) {
    const status = error.status === null ? "" : ` (HTTP ${error.status})`;

    return `Rerank ${error.kind}${status}: ${error.message}`;
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "Unknown evaluation error.";
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer; received ${value}.`);
  }
}

function relevantRanks(
  relevantChunkIds: readonly string[],
  chunkIds: readonly string[],
): Record<string, number | null> {
  const positions = new Map<string, number>();

  chunkIds.forEach((chunkId, index) => {
    if (!positions.has(chunkId)) {
      positions.set(chunkId, index + 1);
    }
  });

  return Object.fromEntries(
    relevantChunkIds.map((chunkId) => [
      chunkId,
      positions.get(chunkId) ?? null,
    ]),
  );
}

function sumUsage(
  usages: readonly (RerankUsage | null)[],
): RerankUsage | null {
  const present = usages.filter((usage): usage is RerankUsage => usage !== null);

  if (present.length === 0) {
    return null;
  }

  function sumField(
    field: keyof RerankUsage,
  ): number | null {
    const values = present
      .map((usage) => usage[field])
      .filter((value): value is number => value !== null);

    if (values.length === 0) {
      return null;
    }

    return values.reduce((total, value) => total + value, 0);
  }

  return {
    searchUnits: sumField("searchUnits"),
    totalTokens: sumField("totalTokens"),
    cost: sumField("cost"),
  };
}

function aggregateStrategy(input: {
  strategy: StrategyName;
  cases: readonly CaseResult[];
  skipped: boolean;
  skipReason: string | null;
}): StrategyAggregate {
  const attemptedCases = input.cases.filter((evaluationCase) =>
    evaluationCase.strategies.some(
      (result) => result.strategy === input.strategy,
    ),
  );

  if (input.skipped) {
    return {
      strategy: input.strategy,
      caseCount: 0,
      answerableCaseCount: 0,
      metricCaseCount: 0,
      failedCaseCount: 0,
      skipped: true,
      skipReason: input.skipReason,
      recallAtK: null,
      precisionAtK: null,
      mrr: null,
      meanLatencyMs: null,
      rerankModel: null,
      rerankLatencyMs: null,
      rerankUsage: null,
    };
  }

  const results = attemptedCases.flatMap((evaluationCase) =>
    evaluationCase.strategies.filter(
      (result) => result.strategy === input.strategy,
    ),
  );
  const answerableCases = attemptedCases.filter(
    (evaluationCase) => evaluationCase.answerable,
  );
  const answerableResults = answerableCases.flatMap((evaluationCase) =>
    evaluationCase.strategies.filter(
      (result) => result.strategy === input.strategy && result.error === null,
    ),
  );

  const recalls = answerableResults
    .map((result) => result.metrics.recallAtK)
    .filter((value): value is number => value !== null);
  const precisions = answerableResults.map(
    (result) => result.metrics.precisionAtK,
  );
  const reciprocalRanks = answerableResults.map(
    (result) => result.metrics.reciprocalRank,
  );
  const rerankResults = results.filter((result) => result.rerank !== null);
  const rerankLatencies = rerankResults
    .map((result) => result.rerank?.latencyMs)
    .filter((value): value is number => value !== undefined);
  const rerankModels = new Set(
    rerankResults
      .map((result) => result.rerank?.model)
      .filter((value): value is string => typeof value === "string"),
  );

  return {
    strategy: input.strategy,
    caseCount: attemptedCases.length,
    answerableCaseCount: answerableCases.length,
    metricCaseCount: answerableResults.length,
    failedCaseCount: results.filter((result) => result.error !== null).length,
    skipped: false,
    skipReason: null,
    recallAtK: mean(recalls),
    precisionAtK: mean(precisions),
    mrr: mean(reciprocalRanks),
    meanLatencyMs: mean(results.map((result) => result.latencyMs)),
    rerankModel:
      rerankModels.size === 1 ? [...rerankModels][0] ?? null : null,
    rerankLatencyMs: mean(rerankLatencies),
    rerankUsage: sumUsage(rerankResults.map((result) => result.rerank?.usage ?? null)),
  };
}

async function runRerankStrategy(input: {
  query: string;
  documentId: string;
  vector: readonly number[];
  model: EmbeddingModelInfo;
  config: RetrievalConfig;
  topK: number;
  reranker: Reranker;
  rerankTopN: number;
}): Promise<{
  hits: RerankedHit[];
  rerank: {
    model: string;
    usage: RerankUsage | null;
    latencyMs: number;
  } | null;
}> {
  const candidateHits: HybridHit[] = await searchHybridCandidates({
    documentId: input.documentId,
    query: input.query,
    vector: input.vector,
    model: input.model,
    candidates: input.config.candidates,
    rrfK: input.config.rrfK,
    topK: Math.max(input.config.candidates, input.topK),
  });
  const rerankWindow = candidateHits.slice(
    0,
    Math.min(input.config.candidates, candidateHits.length),
  );

  if (rerankWindow.length === 0) {
    return { hits: [], rerank: null };
  }

  const outcome = await input.reranker.rerank({
    query: input.query,
    candidates: rerankWindow.map((hit) => ({
      chunkId: hit.chunkId,
      content: hit.content,
    })),
    topN: Math.min(input.rerankTopN, input.topK, rerankWindow.length),
  });
  const byChunkId = new Map(
    rerankWindow.map((hit, index) => [
      hit.chunkId,
      { hit, originalRank: index + 1 },
    ]),
  );
  const hits: RerankedHit[] = outcome.items.map((item) => {
    const entry = byChunkId.get(item.chunkId);

    if (!entry) {
      throw new Error(
        `Rerank returned a chunk that was not sent: "${item.chunkId}".`,
      );
    }

    return {
      ...entry.hit,
      score: item.relevanceScore,
      relevanceScore: item.relevanceScore,
      originalRank: entry.originalRank,
      providerIndex: item.providerIndex,
    };
  });

  return {
    hits,
    rerank: {
      model: outcome.model,
      usage: outcome.usage,
      latencyMs: outcome.latencyMs,
    },
  };
}

export async function runEvaluation(
  input: RunEvaluationInput,
): Promise<EvaluationRunResult> {
  assertPositiveInteger(input.topK, "topK");

  const strategies = input.strategies ?? EVALUATION_STRATEGIES;
  const rerankAvailable = input.reranker !== null;
  const requiresVector = strategies.some(
    (strategy) => strategy === "vector" || strategy === "hybrid" || strategy === "hybrid-rerank",
  );
  const cases: CaseResult[] = [];
  let rerankAbortReason: string | null = null;

  for (const goldCase of input.dataset.goldSet.cases) {
    let queryVector: number[] | null = null;
    let embeddingMs: number | null = null;
    let embeddingError: string | null = null;

    if (requiresVector) {
      const startedAt = performance.now();

      try {
        queryVector = await input.provider.embedQuery(goldCase.question);
      } catch (error) {
        embeddingError = describeError(error);
      } finally {
        embeddingMs = performance.now() - startedAt;
      }
    }

    const caseResult: CaseResult = {
      id: goldCase.id,
      question: goldCase.question,
      documentId: goldCase.documentId,
      answerable: goldCase.answerable,
      relevantChunkIds: goldCase.relevantChunkIds,
      embeddingMs,
      strategies: [],
    };

    for (const strategy of strategies) {
      if (strategy === "hybrid-rerank" && !rerankAvailable) {
        continue;
      }

      if (strategy === "hybrid-rerank" && rerankAbortReason !== null) {
        continue;
      }

      const startedAt = performance.now();

      try {
        let chunkIds: string[] = [];
        let rerank: CaseStrategyResult["rerank"] = null;

        if (strategy === "lexical") {
          const hits = await searchLexicalChunks({
            documentId: goldCase.documentId,
            query: goldCase.question,
            topK: input.topK,
          });

          chunkIds = hits.map((hit) => hit.chunkId);
        } else {
          if (queryVector === null) {
            throw new Error(
              embeddingError ?? "The query vector is not available.",
            );
          }

          if (strategy === "vector") {
            const hits = await searchVectorCandidates({
              documentId: goldCase.documentId,
              vector: queryVector,
              model: input.model,
              topK: input.topK,
            });

            chunkIds = hits.map((hit) => hit.chunkId);
          } else if (strategy === "hybrid") {
            const hits = await searchHybridCandidates({
              documentId: goldCase.documentId,
              query: goldCase.question,
              vector: queryVector,
              model: input.model,
              candidates: input.config.candidates,
              rrfK: input.config.rrfK,
              topK: input.topK,
            });

            chunkIds = hits.map((hit) => hit.chunkId);
          } else {
            const result = await runRerankStrategy({
              query: goldCase.question,
              documentId: goldCase.documentId,
              vector: queryVector,
              model: input.model,
              config: input.config,
              topK: input.topK,
              reranker: input.reranker as Reranker,
              rerankTopN: input.config.rerank.topN,
            });

            chunkIds = result.hits.map((hit) => hit.chunkId);
            rerank = result.rerank;
          }
        }

        caseResult.strategies.push({
          strategy,
          chunkIds,
          relevantRanks: relevantRanks(goldCase.relevantChunkIds, chunkIds),
          metrics: computeRetrievalMetrics(
            goldCase.relevantChunkIds,
            chunkIds,
            input.topK,
          ),
          latencyMs: performance.now() - startedAt,
          rerank,
          error: null,
        });
      } catch (error) {
        if (strategy === "hybrid-rerank") {
          rerankAbortReason = describeError(error);
        }

        caseResult.strategies.push({
          strategy,
          chunkIds: [],
          relevantRanks: relevantRanks(goldCase.relevantChunkIds, []),
          metrics: computeRetrievalMetrics(
            goldCase.relevantChunkIds,
            [],
            input.topK,
          ),
          latencyMs: performance.now() - startedAt,
          rerank: null,
          error: describeError(error),
        });
      }
    }

    cases.push(caseResult);
  }

  const aggregates = strategies.map((strategy) => {
    const rerankSkipped = strategy === "hybrid-rerank" && !rerankAvailable;
    const skipReason = rerankSkipped
      ? input.rerankSkipReason ?? "rerank_not_configured"
      : null;

    return aggregateStrategy({
      strategy,
      cases,
      skipped: rerankSkipped,
      skipReason,
    });
  });

  const rerankResults = cases.flatMap((evaluationCase) =>
    evaluationCase.strategies.filter(
      (result) => result.strategy === "hybrid-rerank" && result.rerank !== null,
    ),
  );
  const rerankModels = new Set(
    rerankResults
      .map((result) => result.rerank?.model)
      .filter((value): value is string => typeof value === "string"),
  );

  return {
    cases,
    strategies: aggregates,
    embeddingMs: mean(
      cases
        .map((evaluationCase) => evaluationCase.embeddingMs)
        .filter((value): value is number => value !== null),
    ),
    rerank: {
      model:
        rerankModels.size === 1 ? [...rerankModels][0] ?? null : input.reranker?.model ?? null,
      latencyMs: mean(
        rerankResults
          .map((result) => result.rerank?.latencyMs)
          .filter((value): value is number => value !== undefined),
      ),
      usage: sumUsage(
        rerankResults.map((result) => result.rerank?.usage ?? null),
      ),
      aborted: rerankAbortReason !== null,
      abortReason: rerankAbortReason,
    },
  };
}
