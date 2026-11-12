import "server-only";

import { getEmbeddingConfig } from "@/lib/embeddings/config";
import { loadEmbeddingExtractor } from "@/lib/embeddings/load-extractor";
import { createEmbeddingProvider } from "@/lib/embeddings/provider-core";
import type { EmbeddingProvider } from "@/lib/embeddings/types";

type EmbeddingGlobal = {
  providerPromise?: Promise<EmbeddingProvider>;
};

const globalForEmbeddings = globalThis as unknown as EmbeddingGlobal;

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

    globalForEmbeddings.providerPromise = loadEmbeddingExtractor(config)
      .then((extractor) => createEmbeddingProvider(extractor, model))
      .catch((error: unknown) => {
        globalForEmbeddings.providerPromise = undefined;
        throw error;
      });
  }

  return globalForEmbeddings.providerPromise;
}
