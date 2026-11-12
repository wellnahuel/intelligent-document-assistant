import type {
  EmbeddingModelInfo,
  EmbeddingProvider,
} from "@/lib/embeddings/types";
import {
  assertEmbeddingVector,
  toPassageText,
  toQueryText,
} from "@/lib/embeddings/vector";

/**
 * Minimal shape of the Transformers.js feature-extraction callable. Keeping
 * it here lets tests inject a fake extractor without loading ONNX.
 */
export type EmbeddingExtractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: true },
) => Promise<{ tolist(): number[][] }>;

export function createEmbeddingProvider(
  extractor: EmbeddingExtractor,
  model: EmbeddingModelInfo,
): EmbeddingProvider {
  async function embed(texts: string[]): Promise<number[][]> {
    const output = await extractor(texts, {
      pooling: "mean",
      normalize: true,
    });
    const vectors = output.tolist();

    if (!Array.isArray(vectors) || vectors.length !== texts.length) {
      throw new Error(
        "The embedding model returned an unexpected number of vectors.",
      );
    }

    for (const vector of vectors) {
      assertEmbeddingVector(vector, model.dimensions);
    }

    return vectors;
  }

  return {
    model,
    async embedPassages(texts) {
      if (texts.length === 0) {
        return [];
      }

      for (const text of texts) {
        if (typeof text !== "string" || text.trim().length === 0) {
          throw new Error("Cannot embed an empty passage.");
        }
      }

      return embed(texts.map(toPassageText));
    },
    async embedQuery(text) {
      const query = text.trim();

      if (!query) {
        throw new Error("Cannot embed an empty query.");
      }

      const vectors = await embed([toQueryText(query)]);
      const vector = vectors[0];

      if (!vector) {
        throw new Error("The embedding model returned no query vector.");
      }

      return vector;
    },
  };
}
