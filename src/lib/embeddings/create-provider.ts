import { AppError } from "@/lib/errors";
import {
  getEmbeddingConfig,
  getEmbeddingModelInfo,
} from "@/lib/embeddings/config";
import { loadEmbeddingExtractor } from "@/lib/embeddings/load-extractor";
import { createOpenRouterEmbeddingProvider } from "@/lib/embeddings/openrouter-embeddings";
import { createEmbeddingProvider } from "@/lib/embeddings/provider-core";
import type { EmbeddingProvider } from "@/lib/embeddings/types";

/**
 * Builds the provider selected by EMBEDDING_PROVIDER. This module has no
 * `server-only` guard because the Sprint 5 evaluation CLI uses it too; both
 * callers still read server-side environment variables.
 *
 * In remote mode the Transformers.js package is never imported, so the local
 * ONNX model is not loaded (and not downloaded) in production.
 */
export async function createConfiguredEmbeddingProvider(): Promise<EmbeddingProvider> {
  const config = getEmbeddingConfig();
  const model = getEmbeddingModelInfo(config);

  if (config.provider === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();

    if (!apiKey) {
      throw new AppError(
        "EMBEDDING_MODEL_UNAVAILABLE",
        "El proveedor remoto de embeddings requiere OPENROUTER_API_KEY en el servidor.",
      );
    }

    return createOpenRouterEmbeddingProvider({
      apiKey,
      model,
      timeoutMs: config.requestTimeoutMs,
    });
  }

  const extractor = await loadEmbeddingExtractor(config);

  return createEmbeddingProvider(extractor, model);
}
