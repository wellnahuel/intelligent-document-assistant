import { getEmbeddingConfig } from "@/lib/embeddings/config";
import { loadEmbeddingExtractor } from "@/lib/embeddings/load-extractor";
import { createEmbeddingProvider } from "@/lib/embeddings/provider-core";
import type { EmbeddingProvider } from "@/lib/embeddings/types";

type NodeEmbeddingGlobal = {
  nodeProviderPromise?: Promise<EmbeddingProvider>;
};

const globalForNodeEmbeddings = globalThis as unknown as NodeEmbeddingGlobal;

/**
 * Process-wide embedding provider for standalone Node scripts (the Sprint 5
 * seed command). The Next.js server keeps using `provider.ts`, which adds the
 * `server-only` guard. Both share the same extractor loader and model config.
 */
export function getNodeEmbeddingProvider(): Promise<EmbeddingProvider> {
  if (!globalForNodeEmbeddings.nodeProviderPromise) {
    const config = getEmbeddingConfig();
    const model = {
      modelId: config.modelId,
      modelRevision: config.modelRevision,
      dimensions: config.dimensions,
    };

    globalForNodeEmbeddings.nodeProviderPromise = loadEmbeddingExtractor(config)
      .then((extractor) => createEmbeddingProvider(extractor, model))
      .catch((error: unknown) => {
        globalForNodeEmbeddings.nodeProviderPromise = undefined;
        throw error;
      });
  }

  return globalForNodeEmbeddings.nodeProviderPromise;
}
