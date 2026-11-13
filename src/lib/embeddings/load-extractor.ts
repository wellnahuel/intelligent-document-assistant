import path from "node:path";

import type { EmbeddingConfig } from "@/lib/embeddings/config";
import type { EmbeddingExtractor } from "@/lib/embeddings/provider-core";

/**
 * Loads the local Transformers.js pipeline without importing `server-only`, so
 * the same implementation can be used by the Next.js server singleton and by
 * the Sprint 5 evaluation CLI. The model revision, dtype and cache directory
 * stay in one place.
 */
export async function loadEmbeddingExtractor(
  config: EmbeddingConfig,
): Promise<EmbeddingExtractor> {
  const { env, pipeline } = await import("@huggingface/transformers");
  const cacheDir = path.resolve(process.cwd(), config.cacheDir);

  env.cacheDir = cacheDir;

  console.info(
    `[embeddings] Loading ${config.modelId}@${config.modelRevision}. ` +
      `The first run may download model files into ${cacheDir}.`,
  );

  const extractor = await pipeline(
    "feature-extraction",
    config.modelId,
    {
      revision: config.modelRevision,
      dtype: config.dtype,
    },
  );

  console.info("[embeddings] Model ready.");

  return extractor as unknown as EmbeddingExtractor;
}
