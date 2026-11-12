import { getEmbeddingProvider } from "@/lib/embeddings/provider";
import type { EmbeddingProvider } from "@/lib/embeddings/types";
import { AppError } from "@/lib/errors";

export async function loadEmbeddingProviderOrThrow(): Promise<EmbeddingProvider> {
  try {
    return await getEmbeddingProvider();
  } catch (error) {
    console.error("[embeddings] Could not load the local model.", error);
    throw new AppError(
      "EMBEDDING_MODEL_UNAVAILABLE",
      "No se pudo cargar el modelo local de embeddings. La primera ejecución puede necesitar descargar archivos; revisá la conexión y la caché.",
    );
  }
}
