import "server-only";

import { logEvent } from "@/lib/observability/log";
import { getOpenRouterConfig, getRagConfig } from "@/lib/rag/config";
import { createNoEvidenceAnswer, generateAnswerFromChunks } from "@/lib/rag/generate";
import { OpenRouterError, requestChatCompletion } from "@/lib/rag/openrouter";
import { mapProviderError } from "@/lib/rag/provider-errors";
import { retrieveDocumentChunks } from "@/lib/rag/retrieval";
import type { AskRequestInput, RagAnswerDto } from "@/lib/rag/types";
import { AppError } from "@/lib/errors";

function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

export async function answerDocumentQuestion(
  input: AskRequestInput & { userId: string; requestId?: string },
): Promise<RagAnswerDto> {
  const startedAt = performance.now();
  const config = getRagConfig();
  const retrieval = await retrieveDocumentChunks({
    userId: input.userId,
    documentId: input.documentId,
    question: input.question,
    topK: config.topK,
  });
  const retrievalInfo = {
    topK: config.topK,
    retrievedCount: retrieval.results.length,
    indexedChunkCount: retrieval.indexedChunkCount,
  };
  const logBase = {
    requestId: input.requestId,
    route: "POST /api/ask",
    topK: config.topK,
    retrievedCount: retrieval.results.length,
    indexedChunkCount: retrieval.indexedChunkCount,
    model: retrieval.model.modelId,
    embeddingMs: retrieval.timings.embeddingMs,
    searchMs: retrieval.timings.searchMs,
    retrievalMs: retrieval.timings.totalMs,
  };

  if (retrieval.results.length === 0) {
    logEvent("info", "ask.completed", {
      ...logBase,
      outcome: "no_evidence",
      code: "no_embeddings",
      totalMs: elapsedMs(startedAt),
    });

    return createNoEvidenceAnswer({
      documentId: retrieval.documentId,
      documentName: retrieval.documentName,
      question: input.question,
      reason: "no_embeddings",
      retrieval: retrievalInfo,
    });
  }

  const generationStartedAt = performance.now();

  try {
    const result = await generateAnswerFromChunks({
      documentId: retrieval.documentId,
      documentName: retrieval.documentName,
      question: input.question,
      chunks: retrieval.results,
      maxContextChars: config.maxContextChars,
      retrieval: retrievalInfo,
      generate: async (prompt) =>
        requestChatCompletion({
          config: getOpenRouterConfig(config),
          system: prompt.system,
          user: prompt.user,
        }),
    });
    const generationMs = elapsedMs(generationStartedAt);
    const usage = result.usage;

    if (result.noEvidence) {
      logEvent("info", "ask.completed", {
        ...logBase,
        outcome: "no_evidence",
        code: result.noEvidenceReason ?? "unknown",
        generationMs,
        sourceCount: result.sources.length,
        totalMs: elapsedMs(startedAt),
      });

      return result;
    }

    logEvent("info", "ask.completed", {
      ...logBase,
      outcome: "answered",
      generationMs,
      sourceCount: result.sources.length,
      citedCount: result.citedSourceIds.length,
      promptTokens: usage?.promptTokens ?? undefined,
      completionTokens: usage?.completionTokens ?? undefined,
      totalTokens: usage?.totalTokens ?? undefined,
      costUsd: usage?.cost ?? undefined,
      totalMs: elapsedMs(startedAt),
    });

    return result;
  } catch (error) {
    const generationMs = elapsedMs(generationStartedAt);

    if (error instanceof OpenRouterError) {
      logEvent("error", "ask.failed", {
        ...logBase,
        outcome: "failed",
        stage: "generation",
        kind: error.kind,
        httpStatus: error.status ?? undefined,
        generationMs,
        totalMs: elapsedMs(startedAt),
      });
      throw mapProviderError(error);
    }

    if (error instanceof AppError) {
      logEvent("error", "ask.failed", {
        ...logBase,
        outcome: "failed",
        stage: "configuration",
        code: error.code,
        generationMs,
        totalMs: elapsedMs(startedAt),
      });
      throw error;
    }

    logEvent("error", "ask.failed", {
      ...logBase,
      outcome: "failed",
      stage: "unknown",
      kind: error instanceof Error ? error.name : "unknown",
      generationMs,
      totalMs: elapsedMs(startedAt),
    });
    throw error;
  }
}
