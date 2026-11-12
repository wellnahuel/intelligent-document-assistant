import { getEmbeddingConfig, getEmbeddingModelInfo } from "@/lib/embeddings/config";
import { loadEmbeddingProviderOrThrow } from "@/lib/embeddings/load-provider";
import {
  countDocumentEmbeddings,
  documentExists,
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
export async function generateDocumentEmbeddings(
  documentId: string,
  options: GenerationOptions,
): Promise<EmbeddingGenerationResultDto> {
  const config = getEmbeddingConfig();
  const model = getEmbeddingModelInfo(config);
  const chunks = await listDocumentChunks(documentId);

  if (chunks.length === 0) {
    if (!(await documentExists(documentId))) {
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
        chunks.map((chunk) => chunk.id),
        model,
      );
  const pending = chunks.filter((chunk) => !existingChunkIds.has(chunk.id));
  const skippedCount = chunks.length - pending.length;

  if (pending.length === 0) {
    const embeddedChunkCount = await countDocumentEmbeddings(documentId, model);

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
      console.error(
        `[embeddings] Inference failed for batch ${batchIndex + 1}/${batchCount}.`,
        error,
      );
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

      await upsertEmbeddingBatch(rows, model);
      generatedCount += batch.length;
    } catch (error) {
      failedCount += batch.length;
      errors.push({
        batch: batchIndex + 1,
        stage: "persistence",
        message: "No se pudo guardar este lote en PostgreSQL.",
      });
      console.error(
        `[embeddings] Persistence failed for batch ${batchIndex + 1}/${batchCount}.`,
        error,
      );
    }
  }

  const embeddedChunkCount = await countDocumentEmbeddings(documentId, model);
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
