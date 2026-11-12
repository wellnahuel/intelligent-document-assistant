import "server-only";

import path from "node:path";

import type { EmbeddingConfig } from "@/lib/embeddings/config";
import { getEmbeddingConfig } from "@/lib/embeddings/config";
import {
  createEmbeddingProvider,
  type EmbeddingExtractor,
} from "@/lib/embeddings/provider-core";
import type { EmbeddingProvider } from "@/lib/embeddings/types";

type EmbeddingGlobal = {
  providerPromise?: Promise<EmbeddingProvider>;
};

const globalForEmbeddings = globalThis as unknown as EmbeddingGlobal;

async function loadExtractor(
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

/**
 * Lazily loads the local E5 model and reuses one provider per process.
 * A failed load clears the promise so a later request can retry instead of
 * caching the failure forever.
 */
export function getEmbeddingProvider(): Promise<EmbeddingProvider> {
  if (!globalForEmbeddings.providerPromise) {
    const config = getEmbeddingConfig();
    const model = {
      modelId: config.modelId,
      modelRevision: config.modelRevision,
      dimensions: config.dimensions,
    };

    globalForEmbeddings.providerPromise = loadExtractor(config)
      .then((extractor) => createEmbeddingProvider(extractor, model))
      .catch((error: unknown) => {
        globalForEmbeddings.providerPromise = undefined;
        throw error;
      });
  }

  return globalForEmbeddings.providerPromise;
}
