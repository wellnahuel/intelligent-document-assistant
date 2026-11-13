import { getEmbeddingConfig, getEmbeddingModelInfo } from "@/lib/embeddings/config";
import { loadEmbeddingProviderOrThrow } from "@/lib/embeddings/load-provider";
import {
  countDocumentEmbeddings,
  documentExistsForUser,
  findExistingChunkIds,
  listDocumentChunks,
  upsertEmbeddingBatch,
} from "@/lib/embeddings/store";
import type {
  EmbeddingGenerationErrorDto,
  EmbeddingGenerationResultDto,
  GenerationOptions,
} from "@/lib/embeddings/types";
import { AppError } from "@/lib/errors";
import { logEvent } from "@/lib/observability/log";

/**
 * Generates the embeddings of every chunk of a document in small batches.
 *
 * Idempotency has two layers:
 * 1. compatible rows are skipped unless `regenerate` is true;
 * 2. the INSERT uses ON CONFLICT on the unique key, so a race or a repeated
 *    batch updates the existing row instead of duplicating it.
 *
 * A failed batch does not hide the successful ones: the result reports
 * complete, partial, or failed, with the affected batch numbers.
 */
export async function generateDocumentEmbeddings(input: {
  userId: string;
  documentId: string;
  options: GenerationOptions;
  requestId?: string;
}): Promise<EmbeddingGenerationResultDto> {
  const { userId, documentId, options } = input;
  const config = getEmbeddingConfig();
  const model = getEmbeddingModelInfo(config);
  const chunks = await listDocumentChunks(userId, documentId);

  if (chunks.length === 0) {
    if (!(await documentExistsForUser(userId, documentId))) {
      throw new AppError("DOCUMENT_NOT_FOUND", "Documento no encontrado.");
    }

    throw new AppError(
      "DOCUMENT_WITHOUT_CHUNKS",
      "El documento todavía no tiene fragmentos. Generá los fragmentos antes de crear embeddings.",
    );
  }

  const existingChunkIds = options.regenerate
    ? new Set<string>()
    : await findExistingChunkIds(
        userId,
        chunks.map((chunk) => chunk.id),
        model,
      );
  const pending = chunks.filter((chunk) => !existingChunkIds.has(chunk.id));
  const skippedCount = chunks.length - pending.length;

  if (pending.length === 0) {
    const embeddedChunkCount = await countDocumentEmbeddings(userId, documentId, model);

    return {
      documentId,
      model,
      chunkCount: chunks.length,
      embeddedChunkCount,
      generatedCount: 0,
      skippedCount,
      failedCount: 0,
      status: "complete",
      errors: [],
    };
  }

  const provider = await loadEmbeddingProviderOrThrow();
  const batchSize = config.batchSize;
  const batchCount = Math.ceil(pending.length / batchSize);
  const errors: EmbeddingGenerationErrorDto[] = [];
  let generatedCount = 0;
  let failedCount = 0;

  for (let batchIndex = 0; batchIndex < batchCount; batchIndex += 1) {
    const start = batchIndex * batchSize;
    const batch = pending.slice(start, start + batchSize);
    let vectors: number[][];

    try {
      vectors = await provider.embedPassages(
        batch.map((chunk) => chunk.content),
      );
    } catch (error) {
      failedCount += batch.length;
      errors.push({
        batch: batchIndex + 1,
        stage: "embedding",
        message: "No se pudo generar el vector de este lote.",
      });
      logEvent("error", "embeddings.batch_failed", {
        requestId: input.requestId,
        route: "POST /api/documents/[id]/embeddings",
        stage: "embedding",
        batchIndex: batchIndex + 1,
        batchCount,
        failedCount: batch.length,
        kind: error instanceof Error ? error.name : "unknown",
      });
      continue;
    }

    try {
      const rows = batch.map((chunk, index) => {
        const vector = vectors[index];

        if (!vector) {
          throw new Error(
            "The model returned fewer vectors than requested passages.",
          );
        }

        return { chunkId: chunk.id, vector };
      });

      await upsertEmbeddingBatch(userId, rows, model);
      generatedCount += batch.length;
    } catch (error) {
      failedCount += batch.length;
      errors.push({
        batch: batchIndex + 1,
        stage: "persistence",
        message: "No se pudo guardar este lote en PostgreSQL.",
      });
      logEvent("error", "embeddings.batch_failed", {
        requestId: input.requestId,
        route: "POST /api/documents/[id]/embeddings",
        stage: "persistence",
        batchIndex: batchIndex + 1,
        batchCount,
        failedCount: batch.length,
        kind: error instanceof Error ? error.name : "unknown",
      });
    }
  }

  const embeddedChunkCount = await countDocumentEmbeddings(userId, documentId, model);
  const status =
    failedCount === 0 ? "complete" : generatedCount > 0 ? "partial" : "failed";

  return {
    documentId,
    model,
    chunkCount: chunks.length,
    embeddedChunkCount,
    generatedCount,
    skippedCount,
    failedCount,
    status,
    errors,
  };
}
