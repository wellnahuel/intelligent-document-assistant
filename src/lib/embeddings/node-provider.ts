import { createConfiguredEmbeddingProvider } from "@/lib/embeddings/create-provider";
import type { EmbeddingProvider } from "@/lib/embeddings/types";

type NodeEmbeddingGlobal = {
  nodeProviderPromise?: Promise<EmbeddingProvider>;
};

const globalForNodeEmbeddings = globalThis as unknown as NodeEmbeddingGlobal;

/**
 * Process-wide embedding provider for standalone Node scripts (the Sprint 5
 * seed command). The Next.js server keeps using `provider.ts`, which adds the
 * `server-only` guard. Both share the same provider selection and model config.
 */
export function getNodeEmbeddingProvider(): Promise<EmbeddingProvider> {
  if (!globalForNodeEmbeddings.nodeProviderPromise) {
    globalForNodeEmbeddings.nodeProviderPromise =
      createConfiguredEmbeddingProvider().catch((error: unknown) => {
        globalForNodeEmbeddings.nodeProviderPromise = undefined;
        throw error;
      });
  }

  return globalForNodeEmbeddings.nodeProviderPromise;
}
