import "server-only";

import { createConfiguredEmbeddingProvider } from "@/lib/embeddings/create-provider";
import type { EmbeddingProvider } from "@/lib/embeddings/types";

type EmbeddingGlobal = {
  providerPromise?: Promise<EmbeddingProvider>;
};

const globalForEmbeddings = globalThis as unknown as EmbeddingGlobal;

/**
 * Reuses one provider per process. The configured implementation can be local
 * (Transformers.js) or remote (OpenRouter); a failed load clears the promise so
 * a later request can retry instead of caching the failure forever.
 */
export function getEmbeddingProvider(): Promise<EmbeddingProvider> {
  if (!globalForEmbeddings.providerPromise) {
    globalForEmbeddings.providerPromise = createConfiguredEmbeddingProvider().catch(
      (error: unknown) => {
        globalForEmbeddings.providerPromise = undefined;
        throw error;
      },
    );
  }

  return globalForEmbeddings.providerPromise;
}
