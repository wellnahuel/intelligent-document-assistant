import { getEmbeddingProvider } from "@/lib/embeddings/provider";
import type { EmbeddingProvider } from "@/lib/embeddings/types";
import { AppError } from "@/lib/errors";

export async function loadEmbeddingProviderOrThrow(): Promise<EmbeddingProvider> {
  try {
    return await getEmbeddingProvider();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    console.error("[embeddings] Could not load the embedding provider.", error);
    throw new AppError(
      "EMBEDDING_MODEL_UNAVAILABLE",
      "No se pudo inicializar el proveedor de embeddings. Revisá EMBEDDING_PROVIDER, EMBEDDING_MODEL_ID y, si es remoto, OPENROUTER_API_KEY.",
    );
  }
}
