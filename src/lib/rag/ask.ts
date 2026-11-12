import "server-only";

import { getOpenRouterConfig, getRagConfig } from "@/lib/rag/config";
import { createNoEvidenceAnswer, generateAnswerFromChunks } from "@/lib/rag/generate";
import { OpenRouterError, requestChatCompletion } from "@/lib/rag/openrouter";
import { retrieveDocumentChunks } from "@/lib/rag/retrieval";
import type { AskRequestInput, RagAnswerDto } from "@/lib/rag/types";
import { AppError } from "@/lib/errors";

function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}

export async function answerDocumentQuestion(
  input: AskRequestInput,
): Promise<RagAnswerDto> {
  const config = getRagConfig();
  const retrievalStartedAt = performance.now();
  const retrieval = await retrieveDocumentChunks({
    documentId: input.documentId,
    question: input.question,
    topK: config.topK,
  });
  const retrievalMs = elapsedMs(retrievalStartedAt);
  const retrievalInfo = {
    topK: config.topK,
    retrievedCount: retrieval.results.length,
    indexedChunkCount: retrieval.indexedChunkCount,
  };

  if (retrieval.results.length === 0) {
    console.info(
      `[rag] retrieval=${retrievalMs}ms sources=0 provider=skipped cause=no_embeddings`,
    );

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

    if (result.noEvidence) {
      console.info(
        `[rag] retrieval=${retrievalMs}ms generation=${generationMs}ms sources=0 provider=skipped cause=${result.noEvidenceReason ?? "unknown"}`,
      );

      return result;
    }

    const usage = result.usage?.totalTokens ?? "n/a";
    console.info(
      `[rag] retrieval=${retrievalMs}ms generation=${generationMs}ms provider=200 sources=${result.sources.length} cited=${result.citedSourceIds.length} usage=${usage}`,
    );

    return result;
  } catch (error) {
    const generationMs = elapsedMs(generationStartedAt);

    if (error instanceof OpenRouterError) {
      console.error(
        `[rag] retrieval=${retrievalMs}ms provider=failed status=${error.status ?? "n/a"} kind=${error.kind} generation=${generationMs}ms`,
      );

      if (error.kind === "timeout") {
        throw new AppError(
          "RAG_PROVIDER_TIMEOUT",
          "El proveedor de respuestas tardó demasiado. Intentá nuevamente en unos minutos.",
        );
      }

      throw new AppError(
        "RAG_PROVIDER_ERROR",
        "No se pudo obtener una respuesta del proveedor. Revisá la configuración o intentá más tarde.",
      );
    }

    if (error instanceof AppError) {
      console.error(
        `[rag] retrieval=${retrievalMs}ms generation-configuration-failed code=${error.code} generation=${generationMs}ms`,
      );
      throw error;
    }

    console.error(
      `[rag] retrieval=${retrievalMs}ms unexpected-generation-error generation=${generationMs}ms`,
      error,
    );
    throw error;
  }
}
